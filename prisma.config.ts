// Prisma 7 — datasource configuration lives here, not in schema.prisma.
// Both URLs come from .env.local (gitignored): DATABASE_URL goes through
// the Supabase Transaction pooler (pgbouncer, port 6543) at runtime, while
// DIRECT_URL hits the Session pooler (port 5432) for migrations & schema
// pushes that need a non-pooled connection.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
