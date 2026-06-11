import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma Client singleton — local-only, backed by a SQLite file
 * (`DATABASE_URL=file:./prisma/dev.db`). No cloud, nothing leaves the machine.
 *
 * Prisma 7 requires a driver adapter; we use the better-sqlite3 adapter.
 * The `globalThis` cache survives Next.js hot reloads in dev.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
