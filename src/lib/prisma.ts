import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma Client singleton.
 *
 * Prisma 7 requires a driver adapter — we use `@prisma/adapter-pg` so the
 * client speaks Postgres over the same node-pg driver we use everywhere
 * else (consistent connection behaviour, IPv6 / pooler aware).
 *
 * In development, Next.js hot-reloads server modules — without this guard
 * we'd leak a fresh client per reload and exhaust Postgres connections in
 * minutes. The `globalThis` cache survives reloads.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing — Prisma client cannot connect.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
