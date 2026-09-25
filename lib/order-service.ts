/**
 * Menghubungkan state machine percakapan dengan database.
 * Dipakai oleh webhook WhatsApp dan halaman simulator.
 */
import type { Prisma } from "@prisma/client";
import { getCatalog } from "./catalog-repo";
import { handleMessage, INITIAL_STATE, type ConversationState, type IncomingMessage } from "./conversation";
import { prisma } from "./db";
import { createExtractor } from "./extractor";
import * as msg from "./messages";
import { draftTotal, lineSubtotal, type Draft } from "./messages";
import { notaUrl } from "./nota-link";
import type { Extractor } from "./order-parser";

export type OutgoingReply = { body: string; mediaUrl?: string };
export type ProcessResult = { replies: OutgoingReply[]; orderId?: number; duplicate?: boolean };

let extractor: Extractor | null = null;

/** Extractor sesuai env EXTRACTOR (claude / openrouter / heuristik), dibuat sekali per proses. */
async function getExtractor(): Promise<Extractor> {
  if (!extractor) extractor = createExtractor((await getCatalog()).catalog).extract;
  return extractor;
}

const STEPS = new Set(["idle", "klarifikasi", "konfirmasi"]);

function readState(value: Prisma.JsonValue | undefined): ConversationState {
  const step = (value as { step?: string } | null)?.step;
  return step && STEPS.has(step) ? (value as unknown as ConversationState) : INITIAL_STATE;
}

async function createOrder(tx: Prisma.TransactionClient, phone: string, draft: Draft, sumber: string) {
  const customer = await tx.customer.upsert({ where: { phone }, create: { phone }, update: {} });
  return tx.order.create({
    data: {
      customerId: customer.id,
      catatanPengiriman: draft.catatanPengiriman,
      total: draftTotal(draft),
      sumber,
      items: {
        create: draft.lines.map((l) => ({
          sku: l.sku,
          nama: l.nama,
          satuan: l.satuan,
          qty: l.qty,
          hargaSatuan: l.harga,
          subtotal: lineSubtotal(l),
        })),
      },
    },
  });
}

export async function processIncoming(input: {
  phone: string;
  message: IncomingMessage;
  messageSid?: string;
  sumber: "whatsapp" | "simulator";
}): Promise<ProcessResult> {
  const { matcher } = await getCatalog();
  const extract = await getExtractor();

  return prisma.$transaction(
    async (tx) => {
      // Serialkan pesan dari nomor yang sama: pesan kedua menunggu pesan pertama selesai diproses.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${input.phone}))) AS l`;

      const conv = await tx.conversation.findUnique({ where: { phone: input.phone } });
      if (input.messageSid && conv?.lastMessageSid === input.messageSid) {
        return { replies: [], duplicate: true }; // Twilio mengirim ulang webhook yang sama
      }

      const turn = await handleMessage(readState(conv?.state), input.message, { extract, matcher });
      const replies: OutgoingReply[] = turn.replies.map((body) => ({ body }));
      let orderId: number | undefined;

      if (turn.effect?.type === "create_order") {
        const order = await createOrder(tx, input.phone, turn.effect.draft, input.sumber);
        orderId = order.id;
        replies.push({ body: msg.orderCreated(order), mediaUrl: notaUrl(order.id) });
      }

      const data = { state: turn.state as unknown as Prisma.InputJsonValue, lastMessageSid: input.messageSid ?? null };
      await tx.conversation.upsert({ where: { phone: input.phone }, create: { phone: input.phone, ...data }, update: data });

      return { replies, orderId };
    },
    // Ekstraksi Claude berjalan di dalam transaksi (menahan lock per nomor), jadi beri waktu longgar.
    { timeout: 50_000, maxWait: 20_000 }, // harus di bawah maxDuration route (60 detik)
  );
}
