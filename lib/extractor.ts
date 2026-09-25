/**
 * Memilih extractor berdasarkan env EXTRACTOR:
 *   claude (default) — Claude via Anthropic API (ANTHROPIC_API_KEY)
 *   openrouter       — model OpenRouter, mis. model gratis (OPENROUTER_API_KEY, OPENROUTER_MODEL)
 *   heuristik        — regex tanpa AI, khusus test/demo
 */
import type { CatalogProduct } from "./catalog";
import { heuristicExtractor } from "./heuristic-extractor";
import { createOpenRouterExtractor, DEFAULT_OPENROUTER_MODEL } from "./openrouter-extractor";
import { createClaudeExtractor, type Extractor } from "./order-parser";

export type ExtractorKind = "claude" | "openrouter" | "heuristik";

export function extractorKind(value = process.env.EXTRACTOR): ExtractorKind {
  const v = (value ?? "claude").toLowerCase();
  if (v === "openrouter" || v === "heuristik") return v;
  return "claude";
}

export function createExtractor(catalog: CatalogProduct[], opts: { kind?: ExtractorKind; model?: string } = {}): {
  extract: Extractor;
  kind: ExtractorKind;
  model: string;
} {
  const kind = opts.kind ?? extractorKind();
  switch (kind) {
    case "heuristik":
      return { extract: heuristicExtractor, kind, model: "heuristik" };
    case "openrouter": {
      const model = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
      return { extract: createOpenRouterExtractor(catalog, { model }), kind, model };
    }
    case "claude": {
      const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
      return { extract: createClaudeExtractor(catalog, { model }), kind, model };
    }
  }
}
