import { NextResponse } from "next/server";
import { MARKUP } from "@/config/catalog";
import { readCapped } from "@/lib/guard";
import { bearer, errors, fail, hold, ledger, resolveModel, settle, supplierKey, underCeiling } from "@/lib/server/gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
 * OpenAI-compatible chat. The model id is a marketplace item id (e.g. "gpt-oss-120b"). The worst case
 * is held from the key before the supplier is called, then settled to the supplier's reported cost
 * times the marketplace markup. "web-answer" runs the same call with a live web search attached.
 * Streaming (stream: true) is passed through; the charge is read from the final usage chunk.
 */

const MAX_BODY = 512 * 1024;
const DEFAULT_MAX_TOKENS = 8192;
const WEB_RESULTS = 5;
const WEB_RESULT_USD = 0.004;

const FORWARDED = new Set([
  "messages",
  "stream",
  "temperature",
  "top_p",
  "top_k",
  "stop",
  "seed",
  "presence_penalty",
  "frequency_penalty",
  "repetition_penalty",
  "response_format",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "logprobs",
  "top_logprobs",
]);

/*
 * Messages must be priceable before the call: text parts, and images only as inline data URLs, each
 * held for IMAGE_TOKENS whatever its byte size (suppliers bill images by resolution, and resize them
 * to a bounded tile count). Remote image URLs, audio, files and other part types are refused.
 */
const MAX_IMAGES = 8;
const IMAGE_TOKENS = 8_000;

/** Number of inline images, or -1 when the messages hold something the hold cannot price. */
function priceableImages(messages: unknown[]) {
  let images = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") return -1;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || !["system", "user", "assistant", "tool", "developer"].includes(role)) return -1;
    if (content === null || content === undefined || typeof content === "string") continue;
    if (!Array.isArray(content)) return -1;
    for (const part of content) {
      const t = (part as { type?: unknown })?.type;
      if (t === "text") continue;
      if (t === "image_url") {
        const url = (part as { image_url?: { url?: unknown } }).image_url?.url;
        if (typeof url === "string" && url.startsWith("data:image/")) {
          images++;
          continue;
        }
      }
      return -1;
    }
  }
  return images <= MAX_IMAGES ? images : -1;
}

type Body = { model?: unknown; messages?: unknown; max_tokens?: unknown; max_completion_tokens?: unknown; stream?: unknown; [k: string]: unknown };

export async function POST(request: Request) {
  const who = bearer(request);
  if ("error" in who) return fail(who.error);
  const store = ledger();
  const key = supplierKey();
  if (!store || !key) return fail(errors.notConfigured);

  const text = await readCapped(request, MAX_BODY).catch(() => null);
  if (text === null) return fail({ status: 413, message: "Request body too large.", type: "invalid_request_error", code: "too_large" });
  let body: Body;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    return fail({ status: 400, message: "The body is not JSON.", type: "invalid_request_error", code: "bad_json" });
  }
  if (typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
    return fail({ status: 400, message: "Send model and a non-empty messages array.", type: "invalid_request_error", code: "bad_request" });
  }
  const images = priceableImages(body.messages);
  if (images < 0) {
    return fail({ status: 400, message: `Messages may hold text and up to ${MAX_IMAGES} inline (data URL) images.`, type: "invalid_request_error", code: "unsupported_content" });
  }
  const model = await resolveModel(body.model);
  if (!model || (model.item.category !== "models" && model.item.slug !== "web-answer")) return fail(errors.unknownModel);
  if (!(await underCeiling(store))) return fail(errors.busy);

  const web = model.item.slug === "web-answer";
  const asked = Number(body.max_tokens ?? body.max_completion_tokens ?? DEFAULT_MAX_TOKENS);
  const maxTokens = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 32_768) : DEFAULT_MAX_TOKENS;
  // Input estimate: one token per two bytes of request is above any real tokenizer's count.
  const worstUsd = (text.length / 2 + images * IMAGE_TOKENS) * model.inUsd + maxTokens * model.outUsd + (web ? WEB_RESULTS * WEB_RESULT_USD : 0);
  const held = Math.ceil(worstUsd * 1.25 * 1_000_000) + 1;
  if (!(await hold(store, who.binding, held))) return fail(errors.broke);

  const stream = body.stream === true;
  // Only fields that cannot raise the cost past the hold are forwarded: no n, no fallback models,
  // no provider routing, plugins or reasoning budgets from the caller.
  const passed = Object.fromEntries(Object.entries(body).filter(([k]) => FORWARDED.has(k)));
  const upstreamBody = {
    ...passed,
    model: model.supplier,
    max_tokens: maxTokens,
    usage: { include: true },
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(web ? { plugins: [{ id: "web", max_results: WEB_RESULTS }] } : {}),
  };

  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "gateway" },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(280_000),
    });
  } catch {
    await settle(store, who.binding, held, 0, { model: model.item.slug, failed: true });
    return fail(errors.supplierDown);
  }
  if (!upstream.ok || !upstream.body) {
    await settle(store, who.binding, held, 0, { model: model.item.slug, failed: true, status: upstream.status });
    const msg = await upstream.text().catch(() => "");
    return fail({ status: upstream.status === 400 ? 400 : 502, message: upstream.status === 400 ? `The supplier refused the request: ${msg.slice(0, 300)}` : errors.supplierDown.message, type: "server_error", code: "supplier_error" });
  }

  if (!stream) {
    const json = (await upstream.json().catch(() => null)) as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }; model?: string } | null;
    if (!json) {
      await settle(store, who.binding, held, 0, { model: model.item.slug, failed: true });
      return fail(errors.supplierDown);
    }
    // No usage report means no way to price the call: it keeps the whole hold.
    const cost = json.usage ? Number(json.usage.cost ?? (json.usage.prompt_tokens ?? 0) * model.inUsd + (json.usage.completion_tokens ?? 0) * model.outUsd) : held / 1_000_000 / MARKUP;
    const charge = await settle(store, who.binding, held, cost, { model: model.item.slug, in: json.usage?.prompt_tokens ?? 0, out: json.usage?.completion_tokens ?? 0 });
    json.model = model.item.slug;
    return NextResponse.json(json, { headers: { "x-charge-usd": (charge / 1_000_000).toFixed(6) } });
  }

  // Streaming: pass every chunk through, watch for the usage chunk, settle when the stream ends.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let usage: { cost?: number; prompt_tokens?: number; completion_tokens?: number } | null = null;
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const cost = Number(usage?.cost ?? (usage?.prompt_tokens ?? 0) * model.inUsd + (usage?.completion_tokens ?? 0) * model.outUsd);
        await settle(store, who.binding, held, usage ? cost : held / 1_000_000 / MARKUP, {
          model: model.item.slug,
          in: usage?.prompt_tokens ?? 0,
          out: usage?.completion_tokens ?? 0,
          stream: true,
        }).catch(() => undefined);
        controller.close();
        return;
      }
      carry += decoder.decode(value, { stream: true });
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const chunk = JSON.parse(line.slice(6)) as { usage?: typeof usage };
          if (chunk.usage) usage = chunk.usage;
        } catch {
          // keep-alive comments and partial lines are passed through untouched
        }
      }
      controller.enqueue(value);
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
      // A caller who hangs up still pays for what the supplier produced; without usage, the hold stands.
      await settle(store, who.binding, held, usage ? Number(usage.cost ?? 0) : held / 1_000_000 / MARKUP, { model: model.item.slug, stream: true, cancelled: true }).catch(() => undefined);
    },
  });
  return new Response(out, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
}
