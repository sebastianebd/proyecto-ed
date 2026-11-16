export type ParentChildCompletion = {
  studentId: string;
  studentName: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: string;
};

export type ParentLessonSummaryItem = {
  id: string;
  lessonNumber: number;
  title: string | null;
  biblePassage: string | null;
  classSundayDate: string | null;
  unlockAt: string | null;
  scheduleStatus: "SCHEDULED" | "PAUSED" | "FORCE_UNLOCKED" | "FORCE_LOCKED";
  unlocked: boolean;
  viewed: { firstViewedAt: string; lastViewedAt: string } | null;
  completions: ParentChildCompletion[];
};

export type ParentUnitItem = {
  id: string;
  classId: string;
  className: string;
  orderNumber: number;
  title: string;
  status: "ACTIVE" | "FINISHED";
  eligibleChildren: { id: string; fullName: string }[];
  lessons: ParentLessonSummaryItem[];
};

export type ParentClassTab = {
  classId: string;
  className: string;
  childNames: string[];
  isHistoricalOnly: boolean;
};

export type ParentUnitsResponse = {
  children: { id: string; fullName: string; classId: string; className: string; relationship: string | null }[];
  classes: ParentClassTab[];
  units: ParentUnitItem[];
};

export type ParentLessonChildState = {
  id: string;
  fullName: string;
  completed: boolean;
  completedByUserId: string | null;
  completedByName: string | null;
  completedAt: string | null;
};

export type ParentLessonDetail = {
  id: string;
  unitId: string;
  unitOrderNumber: number;
  unitTitle: string;
  unitStatus: "ACTIVE" | "FINISHED";
  classId: string;
  className: string;
  lessonNumber: number;
  title: string | null;
  biblePassage: string | null;
  parentSummary: string[];
  reinforcementQuestions: string[];
  classSundayDate: string | null;
  unlockAt: string | null;
  scheduleStatus: string;
  view: { firstViewedAt: string; lastViewedAt: string };
  eligibleChildren: ParentLessonChildState[];
};
