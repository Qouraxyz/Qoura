// Bundles the browser redeem prover (src/lib/credit/prover.worker.ts) and copies the files it loads into public/zk/.
// Runs before `next build` (npm "prebuild"). Outputs are generated, not committed (see .gitignore),
// except public/zk/redeem.json (the compiled circuit, from circuits/build.sh) and public/zk/crs/ (public SRS points).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const out = new URL("public/zk/", root);
mkdirSync(out, { recursive: true });

// The bb.js browser build inlines both WASM binaries as data URLs; we serve the
// single-threaded one as a file instead and keep the 8 MB of base64 out of the bundle.
const stubInlineWasm = {
  name: "stub-inline-wasm",
  setup(b) {
    b.onResolve({ filter: /barretenberg(-threads)?\.js$/ }, (args) =>
      args.importer.includes("fetch_code") ? { path: args.path, namespace: "stub" } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default '';" }));
  },
};

await build({
  entryPoints: [fileURLToPath(new URL("src/lib/credit/prover.worker.ts", root))],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: fileURLToPath(new URL("prover.js", out)),
  plugins: [stubInlineWasm],
  logLevel: "warning",
});

const nm = (p) => new URL(`node_modules/${p}`, root);
copyFileSync(nm("@noir-lang/acvm_js/web/acvm_js_bg.wasm"), new URL("acvm_js_bg.wasm", out));
copyFileSync(nm("@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm"), new URL("noirc_abi_wasm_bg.wasm", out));
const inline = readFileSync(nm("@aztec/bb.js/dest/browser/barretenberg_wasm/fetch_code/browser/barretenberg.js"), "utf8");
const b64 = /base64,([A-Za-z0-9+/=]+)/.exec(inline)?.[1];
if (!b64) throw new Error("bb.js wasm not found");
writeFileSync(new URL("barretenberg.wasm.gz", out), Buffer.from(b64, "base64"));

for (const f of ["crs/bn254_g1_compressed.dat", "crs/bn254_g2.dat", "redeem.json"]) {
  if (!existsSync(new URL(f, out))) throw new Error(`public/zk/${f} is missing`);
}
const size = (f) => (statSync(new URL(f, out)).size / 1e6).toFixed(2) + " MB";
const sha = createHash("sha256").update(readFileSync(new URL("prover.js", out))).digest("hex").slice(0, 16);
console.log(`prover.js ${size("prover.js")} (${sha}), barretenberg.wasm.gz ${size("barretenberg.wasm.gz")}, acvm ${size("acvm_js_bg.wasm")}`);
