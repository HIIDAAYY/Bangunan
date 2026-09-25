import { PrismaClient } from "@prisma/client";

// Satu instance per proses; di dev, hot reload Next.js akan membuat instance baru tanpa ini.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
