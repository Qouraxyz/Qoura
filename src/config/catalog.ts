import { BRAND } from "@/config/brand";
import type { MakerKey } from "@/components/MakerLogo";

/*
 * What the marketplace sells. Each item is served by a supplier model (`supplier`, an OpenRouter id);
 * its live price is the supplier's price times MARKUP, read from the supplier catalog on the server
 * (src/lib/server/catalog.ts). `fallback` is only shown when that catalog cannot be read.
 * Charges are exact: every call is billed at the supplier's reported cost for that call, times MARKUP.
 */

export const MARKUP = 1.2;

export type CategoryKey = "models" | "media" | "search" | "compute";

export const CATEGORIES: {
  key: CategoryKey;
  verb: string;
  label: string;
  art: string;
  live: boolean;
  blurb: string;
}[] = [
  { key: "models", verb: "Reason", label: "Models", art: "/art/think.webp", live: true, blurb: "Language models for reasoning, code and reading images, billed per token." },
  { key: "media", verb: "Render", label: "Images", art: "/art/create.webp", live: true, blurb: "Image generation, billed per call and returned as base64 data." },
  { key: "search", verb: "Look up", label: "Web data", art: "/art/know.webp", live: true, blurb: "Answers grounded in a live web search, with the sources listed." },
  { key: "compute", verb: "Execute", label: "Compute", art: "/art/run.webp", live: false, blurb: "Code sandboxes billed by the second, then GPU jobs. Not on sale yet." },
];

export type Item = {
  slug: string;
  name: string;
  maker: MakerKey | "house";
  makerName: string;
  category: CategoryKey;
  /** Shelf inside a category; models use it for the filter chips. */
  shelf: string;
  supplier: string;
  /** Context window in tokens (models). */
  context?: number;
  input: string;
  blurb: string;
  /** USD per 1M tokens (models) or per call (media, search) before markup; used only when the live catalog is unreachable. */
  fallback: { in?: number; out?: number; call?: number };
  status?: "planned";
};

export const SHELVES = ["Deep reasoning", "Everyday", "Quick", "Vision"] as const;

export const ITEMS: Item[] = [
  // Deep reasoning
  { slug: "kimi-k3", name: "Kimi K3", maker: "kimi", makerName: "Moonshot AI", category: "models", shelf: "Deep reasoning", supplier: "moonshotai/kimi-k3", context: 1_048_576, input: "Text, images", blurb: "Moonshot's largest open model. Long multi-step work with a context of a million tokens.", fallback: { in: 0.73, out: 10 } },
  { slug: "glm-5.3", name: "GLM 5.3", maker: "zai", makerName: "Z.ai", category: "models", shelf: "Deep reasoning", supplier: "z-ai/glm-5.3", context: 1_048_576, input: "Text", blurb: "Z.ai's flagship. Strong at planning, tool calls and code that has to compile the first time.", fallback: { in: 0.08, out: 4.8 } },
  { slug: "deepseek-v4-pro", name: "DeepSeek V4 Pro", maker: "deepseek", makerName: "DeepSeek", category: "models", shelf: "Deep reasoning", supplier: "deepseek/deepseek-v4-pro", context: 1_048_576, input: "Text", blurb: "The larger V4. Careful maths and long proofs at a price that stays under a dollar per million out.", fallback: { in: 0.42, out: 0.84 } },
  { slug: "qwen3.5-397b", name: "Qwen3.5 397B", maker: "qwen", makerName: "Qwen", category: "models", shelf: "Deep reasoning", supplier: "qwen/qwen3.5-397b-a17b", context: 262_144, input: "Text, images, video", blurb: "Qwen's biggest open mixture of experts. Reads documents, screenshots and clips in one request.", fallback: { in: 0.55, out: 3.5 } },
  { slug: "kimi-k2.6", name: "Kimi K2.6", maker: "kimi", makerName: "Moonshot AI", category: "models", shelf: "Deep reasoning", supplier: "moonshotai/kimi-k2.6", context: 262_144, input: "Text, images", blurb: "The previous Kimi line, tuned for agents that call tools many times in a row.", fallback: { in: 0.65, out: 3.41 } },
  { slug: "glm-5.1", name: "GLM 5.1", maker: "zai", makerName: "Z.ai", category: "models", shelf: "Deep reasoning", supplier: "z-ai/glm-5.1", context: 204_800, input: "Text", blurb: "A steady reasoning model with a long track record in coding agents.", fallback: { in: 0.97, out: 3.04 } },
  // Everyday
  { slug: "deepseek-v4-flash", name: "DeepSeek V4 Flash", maker: "deepseek", makerName: "DeepSeek", category: "models", shelf: "Everyday", supplier: "deepseek/deepseek-v4-flash", context: 1_048_576, input: "Text", blurb: "Fast V4 for daily chat, summaries and extraction, with the same long context as Pro.", fallback: { in: 0.03, out: 1.28 } },
  { slug: "deepseek-v3.2", name: "DeepSeek V3.2", maker: "deepseek", makerName: "DeepSeek", category: "models", shelf: "Everyday", supplier: "deepseek/deepseek-v3.2", context: 163_840, input: "Text", blurb: "A proven general model. Good default when a task is ordinary and the bill should be small.", fallback: { in: 0.26, out: 0.8 } },
  { slug: "qwen3.8-27b", name: "Qwen3.8 27B", maker: "qwen", makerName: "Qwen", category: "models", shelf: "Everyday", supplier: "qwen/qwen3.8-27b", context: 1_000_000, input: "Text, images, video", blurb: "A dense mid-size Qwen that runs well on long inputs and mixed media.", fallback: { in: 0.04, out: 2.3 } },
  { slug: "qwen3.6-27b", name: "Qwen3.6 27B", maker: "qwen", makerName: "Qwen", category: "models", shelf: "Everyday", supplier: "qwen/qwen3.6-27b", context: 262_144, input: "Text, images, video", blurb: "The earlier 27B, still a reliable writer and translator.", fallback: { in: 0.32, out: 3.2 } },
  { slug: "llama-3.3-70b", name: "Llama 3.3 70B", maker: "meta", makerName: "Meta", category: "models", shelf: "Everyday", supplier: "meta-llama/llama-3.3-70b-instruct", context: 131_072, input: "Text", blurb: "Meta's widely used 70B. Predictable output that many prompts were written for.", fallback: { in: 0.22, out: 0.5 } },
  { slug: "gpt-oss-120b", name: "GPT OSS 120B", maker: "openai", makerName: "OpenAI", category: "models", shelf: "Everyday", supplier: "openai/gpt-oss-120b", context: 131_072, input: "Text", blurb: "Open weights from OpenAI. Cheap, quick, and reliable when the answer must fit a JSON schema.", fallback: { in: 0.04, out: 0.17 } },
  { slug: "mistral-large-3", name: "Mistral Large 3", maker: "mistral", makerName: "Mistral AI", category: "models", shelf: "Everyday", supplier: "mistralai/mistral-large-2512", context: 262_144, input: "Text, images", blurb: "Mistral's open flagship, at home in European languages and long documents.", fallback: { in: 0.5, out: 1.5 } },
  // Quick
  { slug: "glm-5.3-flash", name: "GLM 5.3 Flash", maker: "zai", makerName: "Z.ai", category: "models", shelf: "Quick", supplier: "z-ai/glm-5.3-flash", context: 1_048_576, input: "Text, images, video", blurb: "The small GLM. Classify, route and tag at volume.", fallback: { in: 0.02, out: 1.2 } },
  { slug: "qwen3.6-35b", name: "Qwen3.6 35B", maker: "qwen", makerName: "Qwen", category: "models", shelf: "Quick", supplier: "qwen/qwen3.6-35b-a3b", context: 262_144, input: "Text, images, video", blurb: "Only 3B parameters active per token, so answers come back almost at once.", fallback: { in: 0.1, out: 0.95 } },
  { slug: "gemma-4-31b", name: "Gemma 4 31B", maker: "gemma", makerName: "Google", category: "models", shelf: "Quick", supplier: "google/gemma-4-31b-it", context: 262_144, input: "Text, images, video", blurb: "Google's open Gemma at full size. Compact, multilingual and inexpensive.", fallback: { in: 0.09, out: 0.34 } },
  { slug: "gemma-4-26b", name: "Gemma 4 26B", maker: "gemma", makerName: "Google", category: "models", shelf: "Quick", supplier: "google/gemma-4-26b-a4b-it", context: 262_144, input: "Text, images, video", blurb: "The sparse Gemma. Similar quality to 31B with fewer active weights.", fallback: { in: 0.09, out: 0.3 } },
  { slug: "gpt-oss-20b", name: "GPT OSS 20B", maker: "openai", makerName: "OpenAI", category: "models", shelf: "Quick", supplier: "openai/gpt-oss-20b", context: 131_072, input: "Text", blurb: "The small open-weight OpenAI model. A cent buys a long conversation.", fallback: { in: 0.02, out: 0.09 } },
  { slug: "mistral-small-4", name: "Mistral Small", maker: "mistral", makerName: "Mistral AI", category: "models", shelf: "Quick", supplier: "mistralai/mistral-small-2603", context: 262_144, input: "Text, images", blurb: "Mistral's small model. Quick replies with sensible formatting.", fallback: { in: 0.15, out: 0.6 } },
  // Vision
  { slug: "qwen3-vl-30b", name: "Qwen3 VL 30B", maker: "qwen", makerName: "Qwen", category: "models", shelf: "Vision", supplier: "qwen/qwen3-vl-30b-a3b-instruct", context: 262_144, input: "Text, images", blurb: "Reads charts, receipts and screenshots and answers in plain text.", fallback: { in: 0.15, out: 0.6 } },
  { slug: "glm-5v-turbo", name: "GLM 5V Turbo", maker: "zai", makerName: "Z.ai", category: "models", shelf: "Vision", supplier: "z-ai/glm-5v-turbo", context: 202_752, input: "Text, images, video", blurb: "Z.ai's vision model for documents and short video.", fallback: { in: 1.2, out: 4 } },

  // Images
  { slug: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", maker: "gemini", makerName: "Google", category: "media", shelf: "Image", supplier: "google/gemini-3.1-flash-image", input: "Text, images", blurb: "Quick pictures and edits from a prompt, with readable text inside the image.", fallback: { call: 0.08 } },
  { slug: "gemini-3.1-flash-lite-image", name: "Gemini 3.1 Flash Lite Image", maker: "gemini", makerName: "Google", category: "media", shelf: "Image", supplier: "google/gemini-3.1-flash-lite-image", input: "Text, images", blurb: "The cheapest picture on the shelf. Good for drafts and thumbnails.", fallback: { call: 0.04 } },
  { slug: "gemini-3-pro-image", name: "Gemini 3 Pro Image", maker: "gemini", makerName: "Google", category: "media", shelf: "Image", supplier: "google/gemini-3-pro-image", input: "Text, images", blurb: "The most detailed Gemini renderer, for final art and complex scenes.", fallback: { call: 0.16 } },
  { slug: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", maker: "gemini", makerName: "Google", category: "media", shelf: "Image", supplier: "google/gemini-2.5-flash-image", input: "Text, images", blurb: "The previous Flash renderer, still strong at keeping a character consistent.", fallback: { call: 0.04 } },
  { slug: "gpt-5-image-mini", name: "GPT 5 Image Mini", maker: "openai", makerName: "OpenAI", category: "media", shelf: "Image", supplier: "openai/gpt-5-image-mini", input: "Text, images", blurb: "OpenAI's smaller image model. Clean layouts and posters.", fallback: { call: 0.05 } },

  // Web data
  { slug: "web-answer", name: "Web answer", maker: "house", makerName: BRAND.name, category: "search", shelf: "Web data", supplier: "deepseek/deepseek-v4-flash", input: "Text", blurb: "A short answer written from a fresh web search, with the pages it used listed underneath.", fallback: { call: 0.03 } },
  { slug: "web-search", name: "Web search", maker: "house", makerName: BRAND.name, category: "search", shelf: "Web data", supplier: "", input: "Text", blurb: "Ranked results with titles, links and snippets. Planned.", fallback: { call: 0.008 }, status: "planned" },
  { slug: "page-reader", name: "Page reader", maker: "house", makerName: BRAND.name, category: "search", shelf: "Web data", supplier: "", input: "URL", blurb: "One page as clean text, without scripts or adverts. Planned.", fallback: { call: 0.002 }, status: "planned" },
];

export const itemBySlug = (slug: string) => ITEMS.find((i) => i.slug === slug);
export const itemsIn = (c: CategoryKey) => ITEMS.filter((i) => i.category === c);

/** Face values offered on every buy panel. Common amounts gather the biggest crowds. */
export const FACES = [1, 2, 5, 10, 25] as const;
export const FACE_MIN = 1;
export const FACE_MAX = 1000;
