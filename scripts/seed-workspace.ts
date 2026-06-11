/**
 * Seed the single local workspace. Local-only, no auth — one workspace is all
 * we need. Idempotent.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const slug = "york";
  const existing = await prisma.workspace.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Workspace already exists: ${existing.slug} (${existing.id})`);
    return;
  }
  const ws = await prisma.workspace.create({
    data: { slug, name: "York Planning", accentColor: "#E31837" },
  });
  console.log(`Created workspace: ${ws.slug} (${ws.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
