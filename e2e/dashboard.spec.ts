import { expect, test } from "@playwright/test";
import { createTestOrder, prisma } from "./helpers";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("pemilik toko melihat pesanan hari ini dan detailnya", async ({ page }) => {
  const order = await createTestOrder();

  await page.goto("/dashboard");
  const card = page.getByTestId("kolom-BARU").getByTestId(`order-${order.id}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("Rp1.000.000");
  await expect(card).toContainText("2 barang");
  await expect(card).toContainText("Proyek E2E, Jl. Uji Coba 1");
  await expect(page.getByTestId("omzet")).toContainText("Rp");

  await card.getByRole("link", { name: `Pesanan #${order.id}` }).click();
  await expect(page).toHaveURL(`/dashboard/orders/${order.id}`);
  await expect(page.getByRole("heading", { name: `Pesanan #${order.id}` })).toBeVisible();
  await expect(page.getByRole("row", { name: /Semen Tiga Roda 50kg/ })).toContainText("10 sak");
  await expect(page.getByRole("row", { name: /Besi Beton 8mm/ })).toContainText("Rp320.000");
  await expect(page.getByTestId("total")).toHaveText("Rp1.000.000");
});

test("pemilik toko mengubah status baru → diproses → dikirim → selesai", async ({ page }) => {
  const order = await createTestOrder();

  // Dari papan: tombol di kartu memindahkan order ke kolom berikutnya.
  await page.goto("/dashboard");
  const inBaru = page.getByTestId("kolom-BARU").getByTestId(`order-${order.id}`);
  await inBaru.getByRole("button", { name: "Proses pesanan" }).click();
  const inDiproses = page.getByTestId("kolom-DIPROSES").getByTestId(`order-${order.id}`);
  await expect(inDiproses).toBeVisible();
  await expect(inBaru).toHaveCount(0);

  // Dari halaman detail: tombol langkah berikutnya.
  await inDiproses.getByRole("link").click();
  await expect(page.getByTestId("status-saat-ini")).toHaveText("Diproses");
  await page.getByRole("button", { name: "Tandai dikirim" }).click();
  await expect(page.getByTestId("status-saat-ini")).toHaveText("Dikirim");
  // Dropdown koreksi harus ikut menampilkan status terbaru (regresi: sempat tertinggal di status lama).
  await expect(page.getByLabel("Koreksi status")).toHaveValue("DIKIRIM");
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(page.getByTestId("status-saat-ini")).toHaveText("Selesai");
  await expect(page.getByRole("button", { name: /Tandai|Proses/ })).toHaveCount(0);

  // Koreksi status lewat dropdown (mis. salah klik).
  await page.getByLabel("Koreksi status").selectOption("DIPROSES");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByTestId("status-saat-ini")).toHaveText("Diproses");

  const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(saved.status).toBe("DIPROSES");
});
