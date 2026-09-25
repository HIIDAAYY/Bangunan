import twilio from "twilio";
import { describe, expect, it } from "vitest";
import { heuristicExtract } from "@/lib/heuristic-extractor";
import { isValidTwilioSignature, parseIncoming, splitMessage } from "@/lib/twilio";

const TOKEN = "test-auth-token";
const URL = "https://toko.example.com/api/whatsapp/webhook";
const PARAMS = { From: "whatsapp:+628123456789", Body: "semen 20 sak", MessageSid: "SM123", NumMedia: "0" };

describe("isValidTwilioSignature", () => {
  const signature = twilio.getExpectedTwilioSignature(TOKEN, URL, PARAMS);

  it("menerima signature yang benar", () => {
    expect(isValidTwilioSignature({ authToken: TOKEN, signature, url: URL, params: PARAMS })).toBe(true);
  });
  it("menolak body yang diubah", () => {
    expect(isValidTwilioSignature({ authToken: TOKEN, signature, url: URL, params: { ...PARAMS, Body: "semen 200 sak" } })).toBe(false);
  });
  it("menolak URL berbeda", () => {
    expect(isValidTwilioSignature({ authToken: TOKEN, signature, url: "http://localhost:3000/api/whatsapp/webhook", params: PARAMS })).toBe(false);
  });
  it("menolak tanpa signature / token salah", () => {
    expect(isValidTwilioSignature({ authToken: TOKEN, signature: null, url: URL, params: PARAMS })).toBe(false);
    expect(isValidTwilioSignature({ authToken: "lain", signature, url: URL, params: PARAMS })).toBe(false);
  });
});

describe("parseIncoming", () => {
  it("mengambil nomor, teks, dan media", () => {
    const r = parseIncoming({
      ...PARAMS,
      NumMedia: "2",
      MediaUrl0: "https://api.twilio.com/m0",
      MediaContentType0: "image/jpeg",
      MediaUrl1: "https://api.twilio.com/m1",
      MediaContentType1: "image/png",
    });
    expect(r.phone).toBe("+628123456789");
    expect(r.from).toBe("whatsapp:+628123456789");
    expect(r.body).toBe("semen 20 sak");
    expect(r.media).toEqual([
      { url: "https://api.twilio.com/m0", contentType: "image/jpeg" },
      { url: "https://api.twilio.com/m1", contentType: "image/png" },
    ]);
  });
});

describe("splitMessage", () => {
  it("pesan pendek tidak dipecah", () => {
    expect(splitMessage("halo")).toEqual(["halo"]);
  });
  it("pesan panjang dipecah per baris di bawah batas", () => {
    const body = Array.from({ length: 100 }, (_, i) => `baris ke-${i} ${"x".repeat(30)}`).join("\n");
    const chunks = splitMessage(body, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks.join("\n")).toBe(body);
  });
});

describe("heuristicExtract (khusus test/demo tanpa API)", () => {
  it("format sederhana + alamat", () => {
    expect(heuristicExtract("semen tiga roda 20 sak, pasir cor 1 rit, kirim ke Jl. Melati 5")).toEqual({
      items: [
        { teks_asli: "semen tiga roda 20 sak", nama: "semen tiga roda", qty: 20, satuan: "sak" },
        { teks_asli: "pasir cor 1 rit", nama: "pasir cor", qty: 1, satuan: "rit" },
      ],
      catatan_pengiriman: "Jl. Melati 5",
    });
  });
});
