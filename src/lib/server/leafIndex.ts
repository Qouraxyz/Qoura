import "server-only";
import { CREDIT_DESK, deskLive } from "@/config/contracts";
import { CREDIT_ADDED_TOPIC, DESK_SIG, decodeCreditAdded, readWord } from "@/lib/abi";
import { getStore } from "@/lib/auth/store";
import { rpc } from "@/lib/feeds/rpc";

/*
 * Index of every credit leaf, read from the desk's CreditAdded logs. Leaves are only written by the
 * desk and each one costs at least a dollar, so the log cannot be flooded cheaply; the index still
 * reads in bounded block spans, a bounded number of reads per request, and one sync at a time.
 * Settled pages of 1,000 leaves are kept in the store so a cold server does not rescan the chain.
 * Browsers never trust this list: they rebuild the root and check it against the desk.
 */

export type LeafRecord = { i: number; leaf: string; face: number; block: number; tx: string };

const PAGE = 1_000;
const CONFIRMATIONS = 2;
const SPANS = [20_000, 5_000, 1_000, 100];
const MAX_READS = 24;

type State = { scanned: number; leaves: LeafRecord[]; storedPages: number };
let state: State | null = null;
let syncing: Promise<void> | null = null;
let lastSync = 0;

const metaKey = "leaves:meta";
const pageKey = (n: number) => `leaves:page:${CREDIT_DESK.address.toLowerCase()}:${n}`;

async function load(): Promise<State> {
  if (state) return state;
  const fresh: State = { scanned: CREDIT_DESK.block - 1, leaves: [], storedPages: 0 };
  const store = getStore();
  if (store) {
    try {
      const meta = JSON.parse((await store.get(metaKey)) ?? "null") as { desk: string; pages: number; scanned: number } | null;
      if (meta && meta.desk === CREDIT_DESK.address.toLowerCase()) {
        for (let n = 0; n < meta.pages; n++) {
          const page = JSON.parse((await store.get(pageKey(n))) ?? "null") as LeafRecord[] | null;
          if (!page || page.length !== PAGE) break;
          fresh.leaves.push(...page);
          fresh.storedPages = n + 1;
        }
        // Resume after the last stored leaf's block (that block is re-read; repeated leaves are skipped).
        if (fresh.leaves.length) fresh.scanned = fresh.leaves[fresh.leaves.length - 1].block - 1;
      }
    } catch {
      // A damaged cache only costs a rescan.
    }
  }
  state = fresh;
  return fresh;
}

async function persist(s: State) {
  const store = getStore();
  if (!store) return;
  const full = Math.floor(s.leaves.length / PAGE);
  for (let n = s.storedPages; n < full; n++) {
    await store.set(pageKey(n), JSON.stringify(s.leaves.slice(n * PAGE, (n + 1) * PAGE)));
    s.storedPages = n + 1;
  }
  await store.set(metaKey, JSON.stringify({ desk: CREDIT_DESK.address.toLowerCase(), pages: s.storedPages, scanned: s.scanned }));
}

type RawLog = { blockNumber: string; transactionHash: string; topics: string[]; data: string };

async function readRange(from: number, to: number) {
  return rpc<RawLog[]>("eth_getLogs", [
    { address: CREDIT_DESK.address, topics: [CREDIT_ADDED_TOPIC], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
  ]);
}

/** Drops leaves past `keep` and reads again from the block of the last leaf kept. */
function rewind(s: State, keep: number) {
  s.leaves.length = Math.min(keep, s.leaves.length);
  s.storedPages = Math.min(s.storedPages, Math.floor(s.leaves.length / PAGE));
  s.scanned = (s.leaves.length ? s.leaves[s.leaves.length - 1].block : CREDIT_DESK.block) - 1;
}

async function syncOnce() {
  const s = await load();
  const head = Number(BigInt(await rpc<string>("eth_blockNumber", []))) - CONFIRMATIONS;
  let reads = 0;
  let level = 0;
  while (s.scanned < head && reads < MAX_READS) {
    const from = s.scanned + 1;
    const to = Math.min(head, from + SPANS[level] - 1);
    let logs: RawLog[];
    try {
      reads++;
      logs = await readRange(from, to);
    } catch (error) {
      if (level < SPANS.length - 1) {
        level++;
        continue;
      }
      throw error;
    }
    for (const log of logs) {
      const c = decodeCreditAdded(log);
      if (!c) continue;
      if (c.index < s.leaves.length) continue; // already known (resumed block)
      if (c.index !== s.leaves.length) {
        // An earlier range came back without logs it should have had: read again from the last known leaf.
        rewind(s, s.leaves.length);
        await persist(s).catch(() => undefined);
        throw new Error("Credit log gap; will retry.");
      }
      s.leaves.push({ i: c.index, leaf: `0x${c.leaf.toString(16)}`, face: c.face, block: Number(BigInt(log.blockNumber)), tx: log.transactionHash });
    }
    s.scanned = to;
  }
  if (s.scanned >= head) {
    // The read endpoint can change between calls (fallbacks), and a lagging node answers a range it has
    // not seen with no logs. The desk's own count at the scanned block settles it: when it differs, the
    // index reads again instead of serving a short list forever.
    const out = await rpc<string>("eth_call", [{ to: CREDIT_DESK.address, data: DESK_SIG.nextIndex }, `0x${head.toString(16)}`]);
    if (!/^0x[0-9a-fA-F]{64}/.test(out)) throw new Error("No credit desk at this endpoint; will retry.");
    const count = Number(readWord(out, 0));
    if (count !== s.leaves.length) rewind(s, count);
  }
  await persist(s).catch(() => undefined);
}

/** Brings the index up to the chain head (bounded work per call), then returns it. */
export async function creditLeaves(): Promise<{ configured: boolean; leaves: LeafRecord[]; scanned: number }> {
  if (!deskLive()) return { configured: false, leaves: [], scanned: 0 };
  if (Date.now() - lastSync > 3_000) {
    if (!syncing) {
      syncing = syncOnce()
        .catch(() => undefined)
        .finally(() => {
          syncing = null;
          lastSync = Date.now();
        });
    }
    await syncing;
  }
  const s = await load();
  return { configured: true, leaves: s.leaves, scanned: s.scanned };
}
