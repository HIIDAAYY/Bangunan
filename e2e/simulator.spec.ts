import { expect, test } from "@playwright/test";
import { prisma } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Mode demo publik (EXTRACTOR=heuristik di playwright.config): pengunjung tanpa login bisa mencoba simulator,
// tapi dashboard tetap terkunci.
test("pengunjung tanpa login: simulator terbuka, dashboard terkunci", async ({ browser, baseURL }) => {
  const visitor = await browser.newContext({ httpCredentials: undefined });
  const page = await visitor.newPage();

  await page.goto(`${baseURL}/simulator`);
  await expect(page.getByText("Ini demo publik tanpa AI")).toBeVisible();
  await page.getByRole("button", { name: /Pesanan dengan item ambigu/ }).click();
  await expect(page.getByTestId("balasan-toko").last()).toContainText("maksudnya yang mana?");

  const dashboard = await page.request.get(`${baseURL}/dashboard`);
  expect(dashboard.status()).toBe(401);
  await visitor.close();
});

// Alur chat lengkap lewat simulator (extractor heuristik, tanpa Claude): ambigu → pilih → YA → order di dashboard.
test("pesanan dari simulator masuk ke dashboard", async ({ page }) => {
  await page.goto("/simulator");
  await page.getByRole("button", { name: "Mulai percakapan baru" }).click();

  const input = page.getByLabel("Pesan");
  const replies = page.getByTestId("balasan-toko");

  await input.fill("semen tiga roda 20 sak, hebel 3 kubik, kirim ke Jl. Simulasi 9");
  await input.press("Enter");
  await expect(replies.last()).toContainText("Untuk hebel 3 kubik, maksudnya yang mana?");

  await input.fill("2");
  await input.press("Enter");
  await expect(replies.last()).toContainText("Ringkasan Pesanan");
  await expect(replies.last()).toContainText("Total: Rp3.760.000");

  await input.fill("YA");
  await input.press("Enter");
  await expect(replies.last()).toContainText("sudah kami terima");
  const text = await replies.last().innerText();
  const orderId = Number(text.match(/#(\d+)/)![1]);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  expect(order.total).toBe(3_760_000);
  expect(order.items.map((i) => i.sku).sort()).toEqual(["HBL-10-M3", "SMN-TR-50"]);

  await page.goto("/dashboard");
  await expect(page.getByTestId(`order-${orderId}`)).toContainText("Jl. Simulasi 9");
});
