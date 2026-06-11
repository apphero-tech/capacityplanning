/**
 * One-time data migration: copy the real planning data from the old
 * pre-Supabase SQLite DB into the new local (workspace-scoped) schema.
 * Idempotent (upsert by id). Run once after `npm run setup`.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { prisma } from "../src/lib/prisma";

const OLD_DB = "/Users/jschumacher/capacityplanning/prisma/dev.db";
const SLUG = "york";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main() {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: SLUG } });
  const old = new Database(OLD_DB, { readonly: true });

  const phases = old.prepare("SELECT * FROM Phase").all() as any[];
  for (const p of phases) {
    await prisma.phase.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id, workspaceId: ws.id, name: p.name, displayOrder: p.displayOrder,
        color: p.color, description: p.description ?? null,
      },
    });
  }

  const sprints = old.prepare("SELECT * FROM Sprint").all() as any[];
  for (const s of sprints) {
    await prisma.sprint.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id, workspaceId: ws.id, name: s.name,
        startDate: s.startDate ?? null, endDate: s.endDate ?? null,
        durationWeeks: s.durationWeeks, workingDays: s.workingDays, focusFactor: s.focusFactor,
        velocityProven: s.velocityProven ?? null, velocityTarget: s.velocityTarget ?? null,
        isCurrent: !!s.isCurrent, isDemo: !!s.isDemo, progressFactor: s.progressFactor ?? 0,
        storyCount: s.storyCount ?? null, storyPoints: s.storyPoints ?? null,
        commitmentSP: s.commitmentSP ?? null, completedSP: s.completedSP ?? null,
        phaseId: s.phaseId ?? null,
      },
    });
  }

  const caps = old.prepare("SELECT * FROM InitialCapacity").all() as any[];
  for (const c of caps) {
    await prisma.initialCapacity.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id, workspaceId: ws.id, lastName: c.lastName, firstName: c.firstName, role: c.role,
        location: c.location ?? "", organization: c.organization ?? "", stream: c.stream ?? "",
        ftPt: c.ftPt ?? "FT", hrsPerWeek: c.hrsPerWeek, isActive: !!c.isActive,
        refinement: c.refinement, design: c.design, development: c.development, qa: c.qa,
        kt: c.kt, lead: c.lead, pmo: c.pmo, retrofits: c.retrofits,
        ocmComms: c.ocmComms, ocmTraining: c.ocmTraining, other: c.other,
      },
    });
  }

  console.log(`Migrated: ${phases.length} phases, ${sprints.length} sprints, ${caps.length} capacities into workspace "${SLUG}".`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
