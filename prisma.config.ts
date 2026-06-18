// Prisma 7 — datasource configuration lives here, not in schema.prisma.
// DATABASE_URL points at the local SQLite file (see .env.example:
// "file:./prisma/dev.db"). Local-only, no cloud connection.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
