/**
 * Evaluasi parser asli (memanggil Claude) terhadap data/sample_orders.json.
 *
 *   npm run eval                        # semua 30 sample
 *   npm run eval -- --only=10,16,24     # sample tertentu
 *   npm run eval -- --concurrency=2
 *   npm run eval -- --provider=openrouter   # atau set EXTRACTOR=openrouter di .env
 *   npm run eval -- --out=eval/x.json   # simpan laporan ke file lain (default eval-report.json)
 *   npm run eval -- --ideal             # tanpa API: pakai tests/fixtures/ideal-extractions.json
 *                                       # (menguji harness & batas atas akurasi matcher)
 *
 * Hasil lengkap disimpan ke eval-report.json.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadCatalogFromFile } from "../lib/catalog";
import { createCatalogMatcher } from "../lib/catalog-matcher";
import { compareOrder, toActual, type Comparison, type SampleOrder } from "../lib/eval-scoring";
import { createExtractor, extractorKind } from "../lib/extractor";
import { toExtractedItems, type Extraction, type Extractor } from "../lib/order-parser";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

// Harga per 1 juta token (USD), untuk estimasi biaya.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

type CaseResult = {
  id: number;
  tingkat_kesulitan: SampleOrder["tingkat_kesulitan"];
  pesan: string;
  pass: boolean;
  comparison?: Comparison;
  catatan_pengiriman: { expected: string | null; actual: string | null; terdeteksi: boolean };
  extraction?: Extraction;
  actual?: ReturnType<typeof toActual>;
  latency_ms: number;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: string;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);

/** Extractor tanpa API yang mengembalikan ekstraksi ideal dari fixture (dicari berdasarkan teks pesan). */
function idealExtractor(samples: SampleOrder[]): Extractor {
  const fixture = JSON.parse(readFileSync("tests/fixtures/ideal-extractions.json", "utf-8")) as Record<
    string,
    [string, number, Extraction["items"][number]["satuan"]][]
  >;
  return async ({ text }) => {
    const sample = samples.find((s) => s.pesan === text)!;
    const items = fixture[String(sample.id)].map(([nama, qty, satuan]) => ({ teks_asli: nama, nama, qty, satuan }));
    return {
      extraction: { items, catatan_pengiriman: sample.catatan_pengiriman },
      model: "ideal-fixture",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  };
}

async function main() {
  const ideal = args.ideal === "true";
  const kind = extractorKind(args.provider);
  if (!ideal && kind === "claude" && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("ANTHROPIC_API_KEY belum diset (isi di .env). Eval memanggil Claude sungguhan.");
    console.error("Pakai OpenRouter: npm run eval -- --provider=openrouter · tanpa API: npm run eval -- --ideal");
    process.exit(1);
  }
  if (!ideal && kind === "openrouter" && !process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY belum diset (isi di .env).");
    process.exit(1);
  }

  const catalog = loadCatalogFromFile();
  const matcher = createCatalogMatcher(catalog);
  const allSamples = JSON.parse(readFileSync("data/sample_orders.json", "utf-8")) as SampleOrder[];
  const chosen = ideal ? null : createExtractor(catalog, { kind, model: args.model });
  const model = chosen?.model ?? "ideal-fixture";
  const extract = chosen?.extract ?? idealExtractor(allSamples);

  let samples = allSamples;
  if (args.only) {
    const ids = new Set(args.only.split(",").map(Number));
    samples = samples.filter((s) => ids.has(s.id));
  }
  const concurrency = Number(args.concurrency ?? (kind === "openrouter" ? 1 : 4));
  console.log(`Model: ${model} · ${samples.length} sample · concurrency ${concurrency}\n`);

  const results = await mapLimit(samples, concurrency, async (s): Promise<CaseResult> => {
    const started = Date.now();
    const base = {
      id: s.id,
      tingkat_kesulitan: s.tingkat_kesulitan,
      pesan: s.pesan,
    };
    try {
      const { extraction, usage, model: servedBy } = await extract({ text: s.pesan });
      const actual = toActual(toExtractedItems(extraction).map(matcher.match));
      const comparison = compareOrder(s.expected, actual);
      const r: CaseResult = {
        ...base,
        pass: comparison.pass,
        comparison,
        catatan_pengiriman: {
          expected: s.catatan_pengiriman,
          actual: extraction.catatan_pengiriman,
          terdeteksi: (s.catatan_pengiriman === null) === (extraction.catatan_pengiriman === null),
        },
        extraction,
        actual,
        latency_ms: Date.now() - started,
        usage,
        model: servedBy,
      };
      console.log(`${r.pass ? "✓" : "✗"} #${s.id} (${s.tingkat_kesulitan}) ${(r.latency_ms / 1000).toFixed(1)}s`);
      return r;
    } catch (err) {
      const message =
        err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err);
      console.log(`! #${s.id} error: ${message}`);
      return {
        ...base,
        pass: false,
        catatan_pengiriman: { expected: s.catatan_pengiriman, actual: null, terdeteksi: false },
        latency_ms: Date.now() - started,
        error: message,
      };
    }
  });

  // --- Ringkasan ---
  const levels = ["mudah", "sedang", "sulit"] as const;
  const perLevel = Object.fromEntries(
    levels.map((lv) => {
      const rs = results.filter((r) => r.tingkat_kesulitan === lv);
      const lulus = rs.filter((r) => r.pass).length;
      return [lv, { lulus, total: rs.length, akurasi: rs.length ? lulus / rs.length : null }];
    }),
  );
  const ok = results.filter((r) => r.comparison);
  const sum = (f: (c: Comparison) => number) => ok.reduce((a, r) => a + f(r.comparison!), 0);
  const itemsBenar = sum((c) => c.itemsBenar);
  const itemsExpected = sum((c) => c.itemsExpected);
  const itemsActual = sum((c) => c.itemsActual);
  const ambiguExpected = sum((c) => c.ambiguExpected);
  const ambiguActual = sum((c) => c.ambiguActual);
  const inputTokens = results.reduce((a, r) => a + (r.usage?.input_tokens ?? 0), 0);
  const outputTokens = results.reduce((a, r) => a + (r.usage?.output_tokens ?? 0), 0);
  const price = model.endsWith(":free") ? { input: 0, output: 0 } : PRICES[model];
  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);

  const summary = {
    model,
    tanggal: new Date().toISOString(),
    total_sample: results.length,
    lulus: results.filter((r) => r.pass).length,
    akurasi_order: results.length ? results.filter((r) => r.pass).length / results.length : 0,
    per_tingkat_kesulitan: perLevel,
    item: {
      benar: itemsBenar,
      expected: itemsExpected,
      dihasilkan: itemsActual,
      recall: itemsExpected ? itemsBenar / itemsExpected : null,
      precision: itemsActual ? itemsBenar / itemsActual : null,
    },
    ambigu: { expected: ambiguExpected, dihasilkan: ambiguActual },
    catatan_pengiriman_terdeteksi: results.filter((r) => r.catatan_pengiriman.terdeteksi).length,
    error: results.filter((r) => r.error).length,
    latensi_ms: {
      rata_rata: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      median: latencies[Math.floor(latencies.length / 2)] ?? 0,
      maks: latencies.at(-1) ?? 0,
    },
    token: { input: inputTokens, output: outputTokens },
    estimasi_biaya_usd: price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : null,
    biaya_per_pesanan_usd:
      price && results.length ? (inputTokens * price.input + outputTokens * price.output) / 1e6 / results.length : null,
  };

  const reportFile = args.out ?? (ideal ? "eval-report.ideal.json" : "eval-report.json");
  writeFileSync(reportFile, JSON.stringify({ summary, results }, null, 2));

  console.log("\n=== Ringkasan ===");
  console.log(`Akurasi order (semua item & ambigu tepat): ${summary.lulus}/${summary.total_sample} (${pct(summary.lulus, summary.total_sample)})`);
  for (const lv of levels) {
    const p = perLevel[lv] as { lulus: number; total: number };
    console.log(`  ${lv.padEnd(7)} ${p.lulus}/${p.total} (${pct(p.lulus, p.total)})`);
  }
  console.log(`Item: recall ${pct(itemsBenar, itemsExpected)}, precision ${pct(itemsBenar, itemsActual)}`);
  console.log(`Item ambigu: diharapkan ${ambiguExpected}, dihasilkan ${ambiguActual}`);
  console.log(`Catatan pengiriman terdeteksi: ${summary.catatan_pengiriman_terdeteksi}/${results.length}`);
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  console.log(`Latensi rata-rata ${sec(summary.latensi_ms.rata_rata)}, median ${sec(summary.latensi_ms.median)}, maks ${sec(summary.latensi_ms.maks)}`);
  if (summary.estimasi_biaya_usd !== null) {
    console.log(`Estimasi biaya: $${summary.estimasi_biaya_usd.toFixed(4)} ($${summary.biaya_per_pesanan_usd!.toFixed(5)}/pesanan)`);
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("\n=== Kegagalan ===");
    for (const f of failures) {
      console.log(`#${f.id} (${f.tingkat_kesulitan}): ${f.pesan.replace(/\n/g, " ⏎ ").slice(0, 90)}`);
      if (f.error) console.log(`   error: ${f.error}`);
      for (const m of f.comparison?.masalah ?? []) console.log(`   - ${m}`);
    }
  }
  console.log(`\nLaporan lengkap: ${reportFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
