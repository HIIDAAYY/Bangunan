import { expect, test } from "@playwright/test";
import { prisma } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Mode demo publik (EXTRACTOR=heuristik di playwright.config): siapa pun yang punya link bisa membuka
// simulator dan dashboard tanpa login.
test("pengunjung tanpa login bisa memakai simulator dan melihat dashboard", async ({ browser, baseURL }) => {
  const visitor = await browser.newContext({ httpCredentials: undefined });
  const page = await visitor.newPage();

  await page.goto(`${baseURL}/simulator`);
  await expect(page.getByText("Ini demo publik tanpa AI")).toBeVisible();
  await page.getByRole("button", { name: /Pesanan dengan item ambigu/ }).click();
  await expect(page.getByTestId("balasan-toko").last()).toContainText("maksudnya yang mana?");

  // Contoh lain = pelanggan lain: percakapan baru, tidak tergabung dengan draf contoh pertama.
  await page.getByRole("button", { name: /Besi full atau banci/ }).click();
  await expect(page.getByTestId("balasan-toko").last()).toContainText("Untuk besi 10 50 batang");
  await expect(page.getByTestId("pesan-pelanggan")).toHaveCount(1);
  await expect(page.getByTestId("balasan-toko")).toHaveCount(1);
  await page.getByLabel("Pesan").fill("banci");
  await page.getByLabel("Pesan").press("Enter");
  await expect(page.getByTestId("balasan-toko").last()).toContainText("Total: Rp4.250.000");
  await expect(page.getByTestId("balasan-toko").last()).not.toContainText("Semen Tiga Roda");

  await page.goto(`${baseURL}/dashboard`);
  await expect(page.getByRole("heading", { name: /pesanan hari ini/ })).toBeVisible();
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
