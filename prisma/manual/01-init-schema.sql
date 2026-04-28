-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "workingDays" INTEGER NOT NULL DEFAULT 20,
    "focusFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "velocityProven" DOUBLE PRECISION,
    "velocityTarget" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "progressFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storyCount" INTEGER,
    "storyPoints" DOUBLE PRECISION,
    "commitmentSP" DOUBLE PRECISION,
    "completedSP" DOUBLE PRECISION,
    "phaseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "stream" TEXT NOT NULL,
    "ftPt" TEXT NOT NULL DEFAULT 'FT',
    "hrsPerWeek" DOUBLE PRECISION NOT NULL,
    "allocation" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "pod" TEXT,
    "sheetRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "storyPoints" DOUBLE PRECISION,
    "pod" TEXT,
    "dependency" TEXT,
    "stream" TEXT NOT NULL,
    "sheetRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sprint" TEXT,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectHoliday" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sprint" TEXT,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ProjectHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtoEntry" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "who" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "team" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,

    CONSTRAINT "PtoEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialCapacity" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "organization" TEXT NOT NULL DEFAULT '',
    "stream" TEXT NOT NULL DEFAULT '',
    "ftPt" TEXT NOT NULL DEFAULT 'FT',
    "hrsPerWeek" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refinement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "design" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "development" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lead" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pmo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retrofits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ocmComms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ocmTraining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InitialCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideEntry" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "defaultVal" TEXT,
    "description" TEXT,

    CONSTRAINT "GuideEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintStory" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sprintId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "storyPoints" DOUBLE PRECISION,
    "pod" TEXT,
    "dependency" TEXT,
    "stream" TEXT NOT NULL,
    "groupName" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#E31837',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "Sprint_workspaceId_idx" ON "Sprint"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_workspaceId_name_key" ON "Sprint"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_workspaceId_idx" ON "TeamMember"("workspaceId");

-- CreateIndex
CREATE INDEX "Story_workspaceId_idx" ON "Story"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Story_workspaceId_key_key" ON "Story"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "PublicHoliday_workspaceId_idx" ON "PublicHoliday"("workspaceId");

-- CreateIndex
CREATE INDEX "ProjectHoliday_workspaceId_idx" ON "ProjectHoliday"("workspaceId");

-- CreateIndex
CREATE INDEX "PtoEntry_workspaceId_idx" ON "PtoEntry"("workspaceId");

-- CreateIndex
CREATE INDEX "InitialCapacity_workspaceId_idx" ON "InitialCapacity"("workspaceId");

-- CreateIndex
CREATE INDEX "GuideEntry_workspaceId_idx" ON "GuideEntry"("workspaceId");

-- CreateIndex
CREATE INDEX "SprintStory_workspaceId_idx" ON "SprintStory"("workspaceId");

-- CreateIndex
CREATE INDEX "SprintStory_sprintId_idx" ON "SprintStory"("sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintStory_sprintId_key_key" ON "SprintStory"("sprintId", "key");

-- CreateIndex
CREATE INDEX "Phase_workspaceId_idx" ON "Phase"("workspaceId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHoliday" ADD CONSTRAINT "ProjectHoliday_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtoEntry" ADD CONSTRAINT "PtoEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialCapacity" ADD CONSTRAINT "InitialCapacity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideEntry" ADD CONSTRAINT "GuideEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintStory" ADD CONSTRAINT "SprintStory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintStory" ADD CONSTRAINT "SprintStory_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
