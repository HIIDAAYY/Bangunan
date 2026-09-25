"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Example = { label: string; text: string };
type Bubble = {
  id: number;
  from: "pelanggan" | "toko" | "sistem";
  text: string;
  imageUrl?: string;
  mediaUrl?: string;
  time: string;
};
type ApiResult = { replies: { body: string; mediaUrl?: string }[]; orderId?: number };

const jam = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/** Format WhatsApp: *tebal*, _miring_, baris baru. Dirender sebagai elemen React (tanpa innerHTML). */
function waFormat(text: string): ReactNode[] {
  return text.split("\n").flatMap((line, li) => {
    const parts = line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, pi) => {
      const key = `${li}-${pi}`;
      if (/^\*[^*]+\*$/.test(part)) return <strong key={key}>{part.slice(1, -1)}</strong>;
      if (/^_[^_]+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
      return <span key={key}>{part}</span>;
    });
    return li === 0 ? parts : [<br key={`br${li}`} />, ...parts];
  });
}

function sessionPhone(): string {
  try {
    const saved = localStorage.getItem("simulator-phone");
    if (saved) return saved;
    const fresh = `0812${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    localStorage.setItem("simulator-phone", fresh);
    return fresh;
  } catch {
    return "081200000000";
  }
}

async function fileToImage(file: File): Promise<{ mediaType: string; base64: string; url: string }> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mediaType: file.type, base64: btoa(binary), url: URL.createObjectURL(file) };
}

export function Chat({ examples, followUps, demoMode }: { examples: Example[]; followUps: string[]; demoMode: boolean }) {
  const [phone, setPhone] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const chatPanel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setPhone(sessionPhone()), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, busy]);

  const push = (b: Omit<Bubble, "id" | "time">) =>
    setBubbles((prev) => [...prev, { ...b, id: nextId.current++, time: jam() }]);

  async function send(message: string) {
    const trimmed = message.trim();
    if ((!trimmed && !image) || busy || !phone) return;
    setBusy(true);
    const img = image ? await fileToImage(image) : null;
    push({ from: "pelanggan", text: trimmed, imageUrl: img?.url });
    setText("");
    setImage(null);
    if (fileInput.current) fileInput.current.value = "";

    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          text: trimmed,
          image: img ? { mediaType: img.mediaType, base64: img.base64 } : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Server membalas ${res.status}`);
      const data = (await res.json()) as ApiResult;
      for (const r of data.replies) push({ from: "toko", text: r.body, mediaUrl: r.mediaUrl });
    } catch (err) {
      push({ from: "sistem", text: `Pesan gagal diproses: ${err instanceof Error ? err.message : "error"}. Coba kirim lagi.` });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (phone) await fetch(`/api/simulator?phone=${encodeURIComponent(phone)}`, { method: "DELETE" });
    setBubbles([]);
  }

  /** Di HP, contoh & balasan cepat ada di bawah chat: gulir ke chat agar balasan bot terlihat. */
  function showChat() {
    const rect = chatPanel.current?.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
      chatPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Tiap contoh mewakili pelanggan lain: mulai percakapan baru agar tidak tergabung dengan draf sebelumnya.
  async function startExample(text: string) {
    if (busy) return;
    showChat();
    setBusy(true); // kunci input selama reset agar pesan yang diketik tidak hilang ikut terhapus
    try {
      await reset();
    } finally {
      setBusy(false);
    }
    await send(text);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:py-10">
      {/* Ponsel */}
      <section
        ref={chatPanel}
        aria-label="Chat WhatsApp toko"
        className="flex h-[min(46rem,calc(100vh-3rem))] flex-col overflow-hidden rounded-[1.75rem] border-8 border-tinta bg-[#efe7dd] shadow-xl"
      >
        <header className="flex items-center gap-3 bg-[#1f6e5c] px-4 py-3 text-white">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-rambu font-extrabold text-tinta" aria-hidden>
            TB
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">Toko Bangunan Sumber Makmur</p>
            <p className="text-xs text-white/80">{busy ? "sedang mengetik…" : "online"}</p>
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-4" data-testid="chat-log" aria-live="polite">
          {bubbles.length === 0 && (
            <p className="mx-auto mt-6 max-w-[16rem] rounded-md bg-[#fff6c8] px-3 py-2 text-center text-xs text-tinta">
              Ketik pesanan seperti pelanggan, atau pilih salah satu contoh chat{" "}
              <span className="lg:hidden">di bawah</span>
              <span className="hidden lg:inline">di samping</span>.
            </p>
          )}
          {bubbles.map((b) =>
            b.from === "sistem" ? (
              <p key={b.id} className="mx-auto max-w-[18rem] rounded-md bg-[#ffe1e1] px-3 py-2 text-center text-xs" role="alert">
                {b.text}
              </p>
            ) : (
              <div key={b.id} className={`flex ${b.from === "pelanggan" ? "justify-end" : "justify-start"}`}>
                <div
                  data-testid={b.from === "toko" ? "balasan-toko" : "pesan-pelanggan"}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-[0.9rem] leading-snug shadow-sm ${
                    b.from === "pelanggan" ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
                  }`}
                >
                  {b.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.imageUrl} alt="Foto daftar belanja" className="mb-1 max-h-60 rounded" />
                  )}
                  {b.text && <p className="break-words">{waFormat(b.text)}</p>}
                  {b.mediaUrl && (
                    <a
                      href={b.mediaUrl}
                      target="_blank"
                      rel="noopener"
                      className="mt-2 flex items-center gap-2 rounded bg-[#f0f2f5] px-3 py-2 font-semibold text-tinta hover:bg-[#e4e7ea]"
                    >
                      <span className="rounded bg-[#c0392b] px-1.5 py-0.5 text-[0.65rem] font-bold text-white">PDF</span>
                      Nota pesanan
                    </a>
                  )}
                  <span className="mt-1 block text-right text-[0.65rem] text-redup">{b.time}</span>
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex justify-start">
              <span className="rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-redup shadow-sm">mengetik…</span>
            </div>
          )}
        </div>

        <form
          className="flex items-end gap-2 bg-[#f0f2f5] p-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          {/* Parser heuristik (demo tanpa AI) tidak bisa membaca foto, jadi unggah foto disembunyikan. */}
          {!demoMode && (
            <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-xl text-redup hover:bg-white">
              <span aria-hidden>📷</span>
              <span className="sr-only">Lampirkan foto daftar belanja</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <div className="min-w-0 flex-1">
            {image && <p className="mb-1 truncate px-2 text-xs text-redup">Foto: {image.name}</p>}
            <label htmlFor="pesan" className="sr-only">
              Pesan
            </label>
            <textarea
              id="pesan"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              placeholder="Ketik pesan"
              className="max-h-32 w-full resize-none rounded-lg bg-white px-3 py-2 text-[0.95rem] outline-none focus-visible:outline-2"
            />
          </div>
          <button
            type="submit"
            disabled={busy || (!text.trim() && !image)}
            className="h-10 shrink-0 rounded-full bg-[#1f6e5c] px-4 font-semibold text-white disabled:opacity-40"
          >
            Kirim
          </button>
        </form>
      </section>

      {/* Panel kontrol demo */}
      <aside className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">Simulator chat</h1>
          <div className="flex gap-4 text-sm font-semibold">
            <button type="button" onClick={reset} className="underline underline-offset-4 hover:no-underline">
              Mulai percakapan baru
            </button>
            <Link href="/dashboard" className="underline underline-offset-4 hover:no-underline">
              Lihat dashboard
            </Link>
          </div>
        </div>
        {demoMode ? (
          <p className="mt-3 max-w-prose rounded-md border-l-4 border-rambu bg-panel px-4 py-3 text-sm">
            Ini demo publik tanpa AI: pesan dibaca parser sederhana, jadi pakai format{" "}
            <em>nama barang, jumlah, satuan</em> seperti contoh di bawah. Versi produksi memakai LLM yang memahami
            typo, bahasa daerah, dan foto catatan (lihat hasil eval di README).
          </p>
        ) : (
          <p className="mt-2 max-w-prose text-redup">
            Alurnya sama dengan pesan WhatsApp sungguhan, hanya tanpa Twilio. Pesanan yang dikonfirmasi dengan
            &ldquo;YA&rdquo; langsung masuk ke dashboard.
          </p>
        )}
        <p className="mt-2 text-sm text-redup">
          Nomor simulasi: <span className="angka">{phone || "…"}</span>
        </p>

        <h2 className="mt-6 font-bold">Contoh chat pelanggan</h2>
        <ul className="mt-2 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
          {examples.map((ex) => (
            <li key={ex.text}>
              <button
                type="button"
                disabled={busy}
                onClick={() => startExample(ex.text)}
                className="w-full rounded-md border border-garis bg-panel px-3 py-2 text-left text-sm hover:border-tinta disabled:opacity-50"
              >
                <span className="mb-1 block text-xs text-redup">{ex.label}</span>
                <span className="line-clamp-2">{ex.text}</span>
              </button>
            </li>
          ))}
        </ul>

        {followUps.length > 0 && (
          <>
            <h2 className="mt-6 font-bold">Balasan cepat</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {followUps.map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    showChat();
                    send(f);
                  }}
                  className="rounded-full border border-tinta px-3 py-1.5 text-sm font-semibold hover:bg-panel disabled:opacity-50"
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </main>
  );
}
