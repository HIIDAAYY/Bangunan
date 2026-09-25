import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isPublicPath, middleware } from "@/middleware";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function req(path: string, auth?: string) {
  return new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });
}
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("isPublicPath", () => {
  it("simulator publik hanya dengan extractor heuristik", () => {
    expect(isPublicPath("/simulator", "heuristik")).toBe(true);
    expect(isPublicPath("/api/simulator", "heuristik")).toBe(true);
    expect(isPublicPath("/simulator", "claude")).toBe(false);
    expect(isPublicPath("/simulator", "openrouter")).toBe(false);
    expect(isPublicPath("/simulator", undefined)).toBe(false);
  });
  it("dashboard tidak pernah publik", () => {
    expect(isPublicPath("/dashboard", "heuristik")).toBe(false);
    expect(isPublicPath("/dashboard/orders/1", "heuristik")).toBe(false);
  });
});

describe("middleware", () => {
  it("mode demo: simulator terbuka, dashboard tetap minta login", () => {
    process.env.EXTRACTOR = "heuristik";
    process.env.DASHBOARD_PASSWORD = "rahasia";
    expect(middleware(req("/simulator")).status).toBe(200);
    expect(middleware(req("/dashboard")).status).toBe(401);
    expect(middleware(req("/dashboard", basic("admin", "salah"))).status).toBe(401);
    expect(middleware(req("/dashboard", basic("admin", "rahasia"))).status).toBe(200);
  });
  it("dengan provider AI: simulator ikut dikunci", () => {
    process.env.EXTRACTOR = "claude";
    process.env.DASHBOARD_PASSWORD = "rahasia";
    expect(middleware(req("/simulator")).status).toBe(401);
    expect(middleware(req("/api/simulator")).status).toBe(401);
  });
  it("produksi tanpa DASHBOARD_PASSWORD → 503, bukan terbuka", () => {
    process.env.EXTRACTOR = "claude";
    delete process.env.DASHBOARD_PASSWORD;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(middleware(req("/dashboard")).status).toBe(503);
  });
});
