import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

/**
 * POST /api/sprints/focus-factor
 * Body: { value: number in [0, 1] }
 *
 * Applies a single focus factor to every sprint in the DB. Focus factor is
 * treated as a project-wide setting — keeping a per-sprint value felt
 * redundant when it's identical everywhere. The value lives in the existing
 * Sprint.focusFactor column (mirrored across rows) to avoid a schema change.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const value = body.value;

    if (typeof value !== "number" || value < 0 || value > 1) {
      return NextResponse.json(
        { error: "value must be a number between 0 and 1" },
        { status: 400 },
      );
    }

    const dbPath = path.join(process.cwd(), "prisma/dev.db");
    const db = new Database(dbPath);
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE Sprint SET focusFactor = ?, updatedAt = ?")
      .run(value, now);
    db.close();

    return NextResponse.json({ ok: true, updated: result.changes, value });
  } catch (err) {
    console.error("POST /api/sprints/focus-factor error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
