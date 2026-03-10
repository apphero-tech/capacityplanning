-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "workingDays" INTEGER NOT NULL DEFAULT 20,
    "focusFactor" REAL NOT NULL DEFAULT 0.9,
    "velocityProven" REAL,
    "velocityTarget" REAL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "storyCount" INTEGER,
    "storyPoints" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "stream" TEXT NOT NULL,
    "ftPt" TEXT NOT NULL DEFAULT 'FT',
    "hrsPerWeek" REAL NOT NULL,
    "allocation" REAL NOT NULL DEFAULT 1.0,
    "pod" TEXT,
    "sheetRow" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Story" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "storyPoints" REAL,
    "pod" TEXT,
    "dependency" TEXT,
    "stream" TEXT NOT NULL,
    "sheetRow" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sprint" TEXT,
    "days" REAL NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "ProjectHoliday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sprint" TEXT,
    "days" REAL NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "PtoEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "who" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "team" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "InitialCapacity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "ftPt" TEXT NOT NULL DEFAULT 'FT',
    "hrsPerWeek" REAL NOT NULL,
    "refinement" REAL NOT NULL DEFAULT 0,
    "design" REAL NOT NULL DEFAULT 0,
    "development" REAL NOT NULL DEFAULT 0,
    "qa" REAL NOT NULL DEFAULT 0,
    "kt" REAL NOT NULL DEFAULT 0,
    "lead" REAL NOT NULL DEFAULT 0,
    "pmo" REAL NOT NULL DEFAULT 0,
    "other" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "GuideEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "section" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "defaultVal" TEXT,
    "description" TEXT
);
