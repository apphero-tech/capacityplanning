-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InitialCapacity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "organization" TEXT NOT NULL DEFAULT '',
    "stream" TEXT NOT NULL DEFAULT '',
    "ftPt" TEXT NOT NULL DEFAULT 'FT',
    "hrsPerWeek" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refinement" REAL NOT NULL DEFAULT 0,
    "design" REAL NOT NULL DEFAULT 0,
    "development" REAL NOT NULL DEFAULT 0,
    "qa" REAL NOT NULL DEFAULT 0,
    "kt" REAL NOT NULL DEFAULT 0,
    "lead" REAL NOT NULL DEFAULT 0,
    "pmo" REAL NOT NULL DEFAULT 0,
    "retrofits" REAL NOT NULL DEFAULT 0,
    "ocmComms" REAL NOT NULL DEFAULT 0,
    "ocmTraining" REAL NOT NULL DEFAULT 0,
    "other" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_InitialCapacity" ("design", "development", "firstName", "ftPt", "hrsPerWeek", "id", "isActive", "kt", "lastName", "lead", "location", "other", "pmo", "qa", "refinement", "role") SELECT "design", "development", "firstName", "ftPt", "hrsPerWeek", "id", "isActive", "kt", "lastName", "lead", "location", "other", "pmo", "qa", "refinement", "role" FROM "InitialCapacity";
DROP TABLE "InitialCapacity";
ALTER TABLE "new_InitialCapacity" RENAME TO "InitialCapacity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
