import type { Role } from "@/lib/auth";
import type { KpiSummary } from "@/lib/kpi-math";

export type TeacherClassItem = {
  id: string;
  name: string;
  ageRange: string | null;
  status: string;
  students: { id: string; fullName: string }[];
};

export type AttendanceStudentRow = {
  studentId: string;
  fullName: string;
  transferredOut: boolean;
  isPresent: boolean | null;
  observation: string | null;
  recordedByName: string | null;
  updatedAt: string | null;
};

export type RecordedAttendanceSummary = {
  attendanceDate: string;
  presentCount: number;
  totalCount: number;
  firstCreatedAt: string | null;
  editDeadlineYmd: string | null;
  withinTeacherWindow: boolean;
  canEdit: boolean;
};

export type HistoryStudentOption = {
  id: string;
  fullName: string;
  status: string;
  transferredOut: boolean;
};

export type TeacherAttendanceResponse = {
  class: { id: string; name: string };
  recordedDates: RecordedAttendanceSummary[];
  historyStudents: HistoryStudentOption[];
  selectedDate: {
    attendanceDate: string;
    firstCreatedAt: string | null;
    editDeadlineYmd: string | null;
    withinTeacherWindow: boolean;
    canEdit: boolean;
    records: AttendanceStudentRow[];
  } | null;
  studentHistory: {
    studentId: string;
    fullName: string;
    records: {
      attendanceDate: string;
      isPresent: boolean;
      observation: string | null;
      updatedAt: string;
    }[];
  } | null;
};

export type TeacherStudentDetail = {
  id: string;
  fullName: string;
  classId: string;
  className: string;
  birthDate: string | null;
  ageYears: number | null;
  specialCare: string | null;
  preferences: string[];
  preferencesNotes: string | null;
  status: string;
};

export type TeacherLessonItem = {
  id: string;
  unitId: string;
  lessonNumber: number;
  title: string | null;
  biblePassage: string | null;
  parentSummary: string[];
  reinforcementQuestions: string[];
  classSundayDate: string | null;
  unlockAt: string | null;
  scheduleStatus: string;
};

export type TeacherUnitItem = {
  id: string;
  classId: string;
  className: string;
  orderNumber: number;
  title: string;
  status: string;
  hasPdf: boolean;
  createdAt: string;
  lessons: TeacherLessonItem[];
};

export type TeacherLessonTrackingResponse = {
  lesson: TeacherLessonItem & {
    unitOrderNumber: number;
    unitTitle: string;
    unitStatus: string;
    classId: string;
    className: string;
  };
  kpis: {
    openViewed: number;
    openExpected: number;
    openPct: number;
    completionDone: number;
    completionExpected: number;
    completionPct: number;
  };
  students: {
    studentId: string;
    fullName: string;
    hasActiveParent: boolean;
    completed: boolean;
    completedByName: string | null;
    completedAt: string | null;
  }[];
  parents: {
    parentId: string;
    fullName: string;
    studentNames: string[];
    viewed: boolean;
    firstViewedAt: string | null;
    lastViewedAt: string | null;
  }[];
};

export type TeacherModuleProps = {
  userRole: Role;
};

export type { KpiSummary };
