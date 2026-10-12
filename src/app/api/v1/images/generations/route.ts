import { NextResponse } from "next/server";
import { readCapped } from "@/lib/guard";
import { bearer, errors, fail, hold, ledger, resolveModel, settle, supplierKey, underCeiling } from "@/lib/server/gateway";
import { supplierModels } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
 * Image items. Body: { model, prompt, n? (1-4), aspect_ratio? }. Pictures come back as base64 in
 * data[].b64_json with their type in mime_type; the gateway keeps no copy, so there are no links.
 * Only pictures that were made are charged (the supplier's reported cost times the markup).
 */

const MAX_BODY = 64 * 1024;
const IMAGE_TOKENS = 1290;
const RATIOS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);

export async function POST(request: Request) {
  const who = bearer(request);
  if ("error" in who) return fail(who.error);
  const store = ledger();
  const key = supplierKey();
  if (!store || !key) return fail(errors.notConfigured);
  const text = await readCapped(request, MAX_BODY).catch(() => null);
  if (text === null) return fail({ status: 413, message: "Request body too large.", type: "invalid_request_error", code: "too_large" });
  let body: { model?: unknown; prompt?: unknown; n?: unknown; aspect_ratio?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail({ status: 400, message: "The body is not JSON.", type: "invalid_request_error", code: "bad_json" });
  }
  if (typeof body.model !== "string" || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return fail({ status: 400, message: "Send model and prompt.", type: "invalid_request_error", code: "bad_request" });
  }
  const model = await resolveModel(body.model);
  if (!model || model.item.category !== "media") return fail(errors.unknownModel);
  if (!(await underCeiling(store))) return fail(errors.busy);
  const n = Math.min(4, Math.max(1, Number.isInteger(body.n) ? (body.n as number) : 1));
  const ratio = typeof body.aspect_ratio === "string" && RATIOS.has(body.aspect_ratio) ? body.aspect_ratio : undefined;

  const priced = (await supplierModels())?.get(model.supplier)?.pricing;
  const perImage = Number(priced?.image_output ?? 0.0001) * IMAGE_TOKENS * 2;
  const held = Math.ceil((perImage * n + body.prompt.length * model.inUsd + 2000 * model.outUsd) * 1.25 * 1_000_000) + 1;
  if (!(await hold(store, who.binding, held))) return fail(errors.broke);

  const data: { b64_json: string; mime_type: string }[] = [];
  let cost = 0;
  for (let i = 0; i < n; i++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "gateway" },
        body: JSON.stringify({
          model: model.supplier,
          messages: [{ role: "user", content: body.prompt }],
          modalities: ["image", "text"],
          usage: { include: true },
          ...(ratio ? { image_config: { aspect_ratio: ratio } } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { usage?: { cost?: number }; choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] };
      cost += Number(json.usage?.cost ?? 0);
      for (const img of json.choices?.[0]?.message?.images ?? []) {
        const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(img.image_url?.url ?? "");
        if (m) data.push({ mime_type: m[1], b64_json: m[2] });
      }
    } catch {
      // A picture that was not made is not charged.
    }
  }
  const charge = await settle(store, who.binding, held, cost, { model: model.item.slug, images: data.length });
  if (!data.length) return fail(errors.supplierDown);
  return NextResponse.json({ created: Math.floor(Date.now() / 1000), model: model.item.slug, data }, { headers: { "x-charge-usd": (charge / 1_000_000).toFixed(6) } });
}
