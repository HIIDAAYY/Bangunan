"use server";

import { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Input = z.object({
  orderId: z.coerce.number().int().positive(),
  status: z.enum(OrderStatus),
});

export async function updateOrderStatus(formData: FormData): Promise<void> {
  const { orderId, status } = Input.parse({ orderId: formData.get("orderId"), status: formData.get("status") });
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/orders/${orderId}`);
}
