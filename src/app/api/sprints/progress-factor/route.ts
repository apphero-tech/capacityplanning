import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

/**
 * POST /api/sprints/progress-factor
 * Body: { value: number } where value is the growth rate applied on top of
 *       the team's historical average completed SP. 0.10 means "plan the
 *       next sprint at +10% over the moving average".
 *
 * Stored on every Sprint row (same pattern as focus factor) because it's a
 * project-wide planning assumption — splitting it per sprint would just
 * create noise.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const value = body.value;

    if (typeof value !== "number" || value < -1 || value > 5) {
      return NextResponse.json(
        { error: "value must be a number between -1 and 5 (fractional)" },
        { status: 400 },
      );
    }

    const dbPath = path.join(process.cwd(), "prisma/dev.db");
    const db = new Database(dbPath);
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE Sprint SET progressFactor = ?, updatedAt = ?")
      .run(value, now);
    db.close();

    return NextResponse.json({ ok: true, updated: result.changes, value });
  } catch (err) {
    console.error("POST /api/sprints/progress-factor error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
