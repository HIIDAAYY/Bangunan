import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isPublicDemo, middleware } from "@/middleware";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function req(path: string, auth?: string) {
  return new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });
}
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("isPublicDemo", () => {
  it("hanya mode heuristik yang publik", () => {
    expect(isPublicDemo("heuristik")).toBe(true);
    expect(isPublicDemo("claude")).toBe(false);
    expect(isPublicDemo("openrouter")).toBe(false);
    expect(isPublicDemo(undefined)).toBe(false);
  });
});

describe("middleware", () => {
  it("mode demo: simulator dan dashboard terbuka tanpa login", () => {
    process.env.EXTRACTOR = "heuristik";
    process.env.DASHBOARD_PASSWORD = "rahasia";
    expect(middleware(req("/simulator")).status).toBe(200);
    expect(middleware(req("/api/simulator")).status).toBe(200);
    expect(middleware(req("/dashboard")).status).toBe(200);
    expect(middleware(req("/dashboard/orders/1")).status).toBe(200);
  });

  it("mode demo tetap terbuka walau DASHBOARD_PASSWORD tidak diset di produksi", () => {
    process.env.EXTRACTOR = "heuristik";
    delete process.env.DASHBOARD_PASSWORD;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(middleware(req("/dashboard")).status).toBe(200);
  });

  it("mode AI: simulator dan dashboard minta login", () => {
    process.env.EXTRACTOR = "claude";
    process.env.DASHBOARD_PASSWORD = "rahasia";
    expect(middleware(req("/simulator")).status).toBe(401);
    expect(middleware(req("/api/simulator")).status).toBe(401);
    expect(middleware(req("/dashboard")).status).toBe(401);
    expect(middleware(req("/dashboard", basic("admin", "salah"))).status).toBe(401);
    expect(middleware(req("/dashboard", basic("admin", "rahasia"))).status).toBe(200);
  });

  it("mode AI di produksi tanpa DASHBOARD_PASSWORD → 503, bukan terbuka", () => {
    process.env.EXTRACTOR = "claude";
    delete process.env.DASHBOARD_PASSWORD;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(middleware(req("/dashboard")).status).toBe(503);
  });
});
