export type Country = "Canada" | "Quebec" | "India" | "USA" | "Venezuela" | "";

export type TeamStream = "PMO" | "MAN" | "DES" | "REF" | "DEV" | "QA" | "UX" | "OCM" | "EXEC";

export type BacklogStream = "1-REF" | "2-DES" | "3-DEV" | "4-QA" | "5-DEMO" | "6-SIT" | "X-OUT";

export type FtPt = "FT" | "PT";

export type SprintStatus = "past" | "previous" | "current" | "next" | "planning" | "future";

export interface Sprint {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationWeeks: number;
  workingDays: number;
  focusFactor: number;
  velocityProven: number | null;
  velocityTarget: number | null;
  isCurrent: boolean;
  /** Product Demo sprint — excluded from capacity projections and backlog planning. */
  isDemo: boolean;
  /** Growth rate applied to moving-average velocity for next-sprint targets (0.10 = +10%). */
  progressFactor: number;
  /** Derived sprint status: past | previous | current | next | future */
  status: SprintStatus;
  /** Whether this sprint is in the active 4-sprint window (previous + current + next + planning) */
  isActive: boolean;
  storyCount: number | null;
  storyPoints: number | null;
  /** Total SP committed at sprint start */
  commitmentSP: number | null;
  /** Total SP actually completed */
  completedSP: number | null;
}

export interface TeamMember {
  id: string;
  lastName: string;
  firstName: string;
  role: string;
  location: Country;
  stream: TeamStream;
  ftPt: FtPt;
  hrsPerWeek: number;
  allocation: number;
  pod: string | null;
  // Computed fields
  effHrsPerWeek: number;
  totalHrs: number;
  holidayHrs: number;
  netHrs: number;
}

export interface Story {
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  pod: string | null;
  dependency: string | null;
  stream: BacklogStream;
  isExcluded: boolean;
}

export interface SprintStory {
  id: string;
  sprintId: string;
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  pod: string | null;
  dependency: string | null;
  stream: BacklogStream;
  groupName: string | null;
  isExcluded: boolean; // computed, not stored
  importedAt: string;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  country: Country;
  sprint: string | null;
  days: number;
}

export interface ProjectHoliday {
  id: string;
  date: string;
  name: string;
  sprint: string | null;
  days: number;
}

export interface PtoEntry {
  id: string;
  who: string;
  location: string;
  team: string | null;
  startDate: string;
  endDate: string;
}

export interface InitialCapacity {
  id: string;
  lastName: string;
  firstName: string;
  role: string;
  location: Country;
  organization: string;
  stream: string;
  ftPt: FtPt;
  hrsPerWeek: number;
  isActive: boolean;
  refinement: number;
  design: number;
  development: number;
  qa: number;
  kt: number;
  lead: number;
  pmo: number;
  retrofits: number;
  ocmComms: number;
  ocmTraining: number;
  other: number;
}

export interface DevCapacity {
  name: string;
  role: string;
  location: Country;
  hrsPerWeek: number;
  devPercent: number;
  effHrsPerWeek: number;
  weeks: number;
  grossHrs: number;
  holidays: number;
  holidayHrs: number;
  focusPercent: number;
  netDevHrs: number;
}

export interface CapacityRow {
  stream: string;
  scopeSP: number;
  stories: number;
  capacityHrs: number;
  totalHrs: number;
  velocity: number | null;
  projectedSP: number | null;
  gap: number | null;
  coveragePercent: number | null;
  status: "OK" | "At Risk" | "Over" | "N/A";
}

export interface DevProjection {
  netDevCapacity: number;
  velocityProven: number;
  velocityTarget: number;
  projectedSPProven: number;
  projectedSPTarget: number;
  backlogDevSP: number;
  gapProven: number;
  gapTarget: number;
  coverageProven: number;
  coverageTarget: number;
}

export interface DashboardKPIs {
  currentSprint: string;
  teamSize: number;
  totalNetCapacity: number;
  totalBacklogSP: number;
  devGap: number;
  devCoverage: number;
  storiesCount: number;
  devNetHrs: number;
}
