import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Esquema según docs/02-diseno-y-arquitectura.md §3 y límites de docs/03-seguridad.md §7.
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  rut: varchar("rut", { length: 10 }).notNull().unique(),
  fullName: varchar("full_name", { length: 80 }).notNull(),
  email: varchar("email", { length: 120 }).notNull().unique(),
  phone: varchar("phone", { length: 15 }),
  role: varchar("role", { length: 20 }).notNull(), // SUPER_ADMIN | TEACHER | PARENT
  status: varchar("status", { length: 24 }).notNull().default("PENDING_ONBOARDING"), // PENDING_ONBOARDING | ACTIVE | INACTIVE
  onboardedAt: ts("onboarded_at"),
  lastSeenAt: ts("last_seen_at"),
  createdAt: createdAt(),
});

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
});

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: createdAt(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  platform: varchar("platform", { length: 10 }).notNull(), // android | ios | desktop
  createdAt: createdAt(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull(),
  ageRange: varchar("age_range", { length: 80 }),
  status: varchar("status", { length: 12 }).notNull().default("ACTIVE"), // ACTIVE | ARCHIVED
  createdAt: createdAt(),
});

export const classTeachers = pgTable(
  "class_teachers",
  {
    classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.classId, t.teacherId] })],
);

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id),
  fullName: varchar("full_name", { length: 80 }).notNull(),
  birthDate: date("birth_date"),
  specialCare: varchar("special_care", { length: 300 }),
  preferences: jsonb("preferences").$type<string[]>(),
  preferencesNotes: varchar("preferences_notes", { length: 250 }),
  status: varchar("status", { length: 12 }).notNull().default("ACTIVE"), // ACTIVE | INACTIVE
  createdAt: createdAt(),
});

export const studentClassHistory = pgTable(
  "student_class_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id").notNull().references(() => classes.id),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
    unassignedAt: ts("unassigned_at"),
  },
  (t) => [
    index("student_class_history_student_unassigned_idx").on(t.studentId, t.unassignedAt),
    index("student_class_history_class_assigned_idx").on(t.classId, t.assignedAt),
  ],
);

export const parentStudents = pgTable(
  "parent_students",
  {
    parentId: uuid("parent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 30 }),
  },
  (t) => [primaryKey({ columns: [t.parentId, t.studentId] })],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull().references(() => classes.id),
    orderNumber: integer("order_number").notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    pdfStorageKey: text("pdf_storage_key"), // nullable en DRAFT
    status: varchar("status", { length: 12 }).notNull().default("DRAFT"), // DRAFT | ACTIVE | FINISHED
    createdAt: createdAt(),
  },
  (t) => [
    // Máximo 1 unidad ACTIVE por clase
    uniqueIndex("units_one_active_per_class_idx").on(t.classId).where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    lessonNumber: integer("lesson_number").notNull(), // 1..14
    title: varchar("title", { length: 120 }), // nullable en DRAFT
    biblePassage: varchar("bible_passage", { length: 80 }),
    parentSummary: jsonb("parent_summary").$type<string[]>(),
    reinforcementQuestions: jsonb("reinforcement_questions").$type<string[]>(),
    classSundayDate: date("class_sunday_date"),
    unlockAt: ts("unlock_at"),
    scheduleStatus: varchar("schedule_status", { length: 20 }).notNull().default("SCHEDULED"), // SCHEDULED | PAUSED | FORCE_UNLOCKED | FORCE_LOCKED
    pushSent: boolean("push_sent").notNull().default(false),
  },
  (t) => [uniqueIndex("lessons_unit_number_idx").on(t.unitId, t.lessonNumber)],
);

export const lessonViews = pgTable(
  "lesson_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstViewedAt: ts("first_viewed_at").notNull().defaultNow(),
    lastViewedAt: ts("last_viewed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lesson_views_lesson_parent_idx").on(t.lessonId, t.parentId)],
);

export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    completedByUserId: uuid("completed_by_user_id").notNull().references(() => users.id),
    completedAt: ts("completed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lesson_completions_lesson_student_idx").on(t.lessonId, t.studentId)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull().references(() => classes.id),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(), // domingo <= hoy
    isPresent: boolean("is_present").notNull(),
    observation: varchar("observation", { length: 200 }),
    recordedByUserId: uuid("recorded_by_user_id").notNull().references(() => users.id),
    createdAt: createdAt(), // ancla ventana 3d vía MIN(created_at) por clase/domingo
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_class_student_date_idx").on(t.classId, t.studentId, t.attendanceDate)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: varchar("actor_role", { length: 20 }),
    action: varchar("action", { length: 60 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: varchar("entity_id", { length: 64 }),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt.desc()),
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_action_idx").on(t.action),
  ],
);
