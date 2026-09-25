import { beforeAll, describe, expect, it } from "vitest";
import { formatQty, formatRupiah, todayRangeWIB } from "@/lib/format";
import { notaUrl, signNota, verifyNota } from "@/lib/nota-link";
import { renderNotaPdf } from "@/lib/nota-pdf";

beforeAll(() => {
  process.env.APP_SECRET = "rahasia-test";
  process.env.PUBLIC_BASE_URL = "https://toko.example.com/";
});

describe("format", () => {
  it.each([
    [68000, "Rp68.000"],
    [0, "Rp0"],
    [999, "Rp999"],
    [1234567, "Rp1.234.567"],
    [2150000.4, "Rp2.150.000"],
  ])("formatRupiah(%d) = %s", (n, s) => {
    expect(formatRupiah(n)).toBe(s);
  });

  it("formatQty memakai koma desimal", () => {
    expect(formatQty(20)).toBe("20");
    expect(formatQty(0.5)).toBe("0,5");
  });

  it("todayRangeWIB: 23.30 WIB masih hari yang sama, 00.30 WIB sudah hari berikutnya", () => {
    // 2026-09-24 23:30 WIB = 16:30 UTC
    const late = todayRangeWIB(new Date("2026-09-24T16:30:00Z"));
    expect(late.start.toISOString()).toBe("2026-09-23T17:00:00.000Z");
    expect(late.end.toISOString()).toBe("2026-09-24T17:00:00.000Z");
    // 2026-09-25 00:30 WIB = 2026-09-24 17:30 UTC
    const early = todayRangeWIB(new Date("2026-09-24T17:30:00Z"));
    expect(early.start.toISOString()).toBe("2026-09-24T17:00:00.000Z");
  });
});

describe("link nota", () => {
  it("token valid hanya untuk order yang sama", () => {
    const t = signNota(12);
    expect(verifyNota(12, t)).toBe(true);
    expect(verifyNota(13, t)).toBe(false);
    expect(verifyNota(12, null)).toBe(false);
    expect(verifyNota(12, t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBe(false);
  });

  it("URL memakai PUBLIC_BASE_URL tanpa garis miring ganda", () => {
    expect(notaUrl(12)).toBe(`https://toko.example.com/api/nota/12?t=${signNota(12)}`);
  });
});

describe("renderNotaPdf", () => {
  it("menghasilkan PDF", async () => {
    const pdf = await renderNotaPdf({
      id: 7,
      createdAt: new Date("2026-09-24T03:00:00Z"),
      customer: { phone: "+628123", name: null },
      catatanPengiriman: "Jl. Melati 5",
      total: 1_360_000 + 1_075_000,
      items: [
        { sku: "SMN-TR-50", nama: "Semen Tiga Roda 50kg", satuan: "sak", qty: 20, hargaSatuan: 68_000, subtotal: 1_360_000 },
        { sku: "PSR-COR-RIT", nama: "Pasir Cor per Rit (truk engkel ±7 m³)", satuan: "rit", qty: 0.5, hargaSatuan: 2_150_000, subtotal: 1_075_000 },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1500);
  });
});
