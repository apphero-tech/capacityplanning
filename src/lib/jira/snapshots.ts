/**
 * Snapshot persistence for the Jira Flow module. Mirrors the data-access
 * pattern in src/lib/data.ts — better-sqlite3 directly against prisma/dev.db,
 * not Prisma at runtime.
 *
 * Each refresh of /flow writes one snapshot row, so we keep a history we can
 * trend over time and feed the weekly SteerCo export. JSON-heavy columns hold
 * the raw computed result (the same idea as the toolkit's york-ai-toolkit-db.json).
 *
 * The StreamSnapshot / AgingSnapshot tables are created by
 * scripts/migrate-local-db.ts (CREATE TABLE IF NOT EXISTS) and declared in
 * prisma/schema.prisma for fresh installs.
 */
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

import type { StreamResult, AgingResult } from "./flow-metrics";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

// --- Stream ---------------------------------------------------------------

export function saveStreamSnapshot(result: StreamResult, takenAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO StreamSnapshot (id, takenAt, windowDays, countsJson, pointsJson, dailyJson, rowsJson, unclassified)
       VALUES (@id, @takenAt, @windowDays, @countsJson, @pointsJson, @dailyJson, @rowsJson, @unclassified)`,
    )
    .run({
      id: randomUUID(),
      takenAt,
      windowDays: result.windowDays,
      countsJson: JSON.stringify(result.counts),
      pointsJson: JSON.stringify(result.points),
      dailyJson: JSON.stringify(result.daily),
      rowsJson: JSON.stringify(result.rows),
      unclassified: result.unclassified,
    });
}

// --- Aging ----------------------------------------------------------------

export function saveAgingSnapshot(result: AgingResult, sprintId: number, takenAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO AgingSnapshot (id, takenAt, sprintId, threshold, rowsJson, staleCount, blockedCount)
       VALUES (@id, @takenAt, @sprintId, @threshold, @rowsJson, @staleCount, @blockedCount)`,
    )
    .run({
      id: randomUUID(),
      takenAt,
      sprintId,
      threshold: result.threshold,
      rowsJson: JSON.stringify(result.rows),
      staleCount: result.staleCount,
      blockedCount: result.blockedCount,
    });
}

// --- History (for trends / SteerCo) --------------------------------------

interface StreamSnapshotRow {
  takenAt: string;
  windowDays: number;
  countsJson: string;
  pointsJson: string;
  unclassified: number;
}

export interface StreamHistoryPoint {
  takenAt: string;
  windowDays: number;
  counts: number[];
  points: number[];
  unclassified: number;
}

/** Chronological (oldest→newest) — ready to plot on a time axis. */
export function getStreamHistory(limit = 30): StreamHistoryPoint[] {
  const rows = getDb()
    .prepare(`SELECT takenAt, windowDays, countsJson, pointsJson, unclassified
              FROM StreamSnapshot ORDER BY takenAt DESC LIMIT ?`)
    .all(limit) as StreamSnapshotRow[];
  return rows
    .map((r) => ({
      takenAt: r.takenAt,
      windowDays: r.windowDays,
      counts: JSON.parse(r.countsJson) as number[],
      points: JSON.parse(r.pointsJson) as number[],
      unclassified: r.unclassified,
    }))
    .reverse();
}

interface AgingSnapshotRow {
  takenAt: string;
  threshold: number;
  staleCount: number;
  blockedCount: number;
  rowsJson: string;
}

export interface AgingHistoryPoint {
  takenAt: string;
  threshold: number;
  total: number;
  staleCount: number;
  blockedCount: number;
}

/** Aging trend for one sprint, chronological (oldest→newest). */
export function getAgingHistory(sprintId: number, limit = 30): AgingHistoryPoint[] {
  const rows = getDb()
    .prepare(`SELECT takenAt, threshold, staleCount, blockedCount, rowsJson
              FROM AgingSnapshot WHERE sprintId = ? ORDER BY takenAt DESC LIMIT ?`)
    .all(sprintId, limit) as AgingSnapshotRow[];
  return rows
    .map((r) => ({
      takenAt: r.takenAt,
      threshold: r.threshold,
      total: (JSON.parse(r.rowsJson) as unknown[]).length,
      staleCount: r.staleCount,
      blockedCount: r.blockedCount,
    }))
    .reverse();
}
