import sampleOrders from "@/data/sample_orders.json";
import { DEMO_EXAMPLES, DEMO_FOLLOW_UPS } from "@/lib/demo-examples";
import type { SampleOrder } from "@/lib/eval-scoring";
import { extractorKind } from "@/lib/extractor";
import { Chat } from "./chat";

// Dibaca per request agar mode demo mengikuti env EXTRACTOR di server.
export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  const demoMode = extractorKind() === "heuristik";

  // Mode demo (tanpa AI): contoh berformat sederhana yang dipahami parser heuristik.
  // Mode AI: 30 chat asli dari data/sample_orders.json (pesan multi-bagian digabung, tanpa penanda jam).
  const examples = demoMode
    ? DEMO_EXAMPLES.map((e) => ({ label: e.label, text: e.text }))
    : (sampleOrders as SampleOrder[]).map((s) => ({
        label: `Contoh ${s.id} · ${s.tingkat_kesulitan}`,
        text: s.pesan.replace(/^\[\d{2}\.\d{2}\]\s*/gm, ""),
      }));

  return <Chat examples={examples} followUps={demoMode ? DEMO_FOLLOW_UPS : []} demoMode={demoMode} />;
}
