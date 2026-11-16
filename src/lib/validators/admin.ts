import { z } from "zod";
import {
  emailSchema,
  emptyToUndefined,
  fullNameSchema,
  paginationSchema,
  phoneSchema,
  rutSchema,
  uuidV4Schema,
} from "./common";
import {
  ageRangeSchema,
  birthDateSchema,
  classNameSchema,
  isoDateSchema,
  preferencesNotesSchema,
  preferencesSchema,
  relationshipSchema,
  specialCareSchema,
} from "./domain";

export const userRoleSchema = z.enum(["SUPER_ADMIN", "TEACHER", "PARENT"], {
  error: "Rol inválido",
});

export const adminCreateUserSchema = z.object({
  rut: rutSchema,
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  role: userRoleSchema,
});

export const adminUpdateUserSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  role: userRoleSchema.optional(),
  status: z.enum(["PENDING_ONBOARDING", "ACTIVE", "INACTIVE"]).optional(),
});

export const adminClassSchema = z.object({
  name: classNameSchema,
  ageRange: ageRangeSchema,
  teacherIds: z.array(uuidV4Schema).default([]),
});

export const adminUpdateClassSchema = z.object({
  name: classNameSchema.optional(),
  ageRange: ageRangeSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  teacherIds: z.array(uuidV4Schema).optional(),
});

export const parentLinkSchema = z.object({
  parentId: uuidV4Schema,
  relationship: relationshipSchema,
});

export const adminCreateStudentSchema = z.object({
  fullName: fullNameSchema,
  classId: uuidV4Schema,
  birthDate: birthDateSchema,
  specialCare: specialCareSchema,
  preferences: preferencesSchema,
  preferencesNotes: preferencesNotesSchema,
  parents: z.array(parentLinkSchema).default([]),
});

export const adminUpdateStudentSchema = z.object({
  fullName: fullNameSchema.optional(),
  classId: uuidV4Schema.optional(),
  birthDate: birthDateSchema.nullable().optional(),
  specialCare: specialCareSchema.nullable().optional(),
  preferences: preferencesSchema.nullable().optional(),
  preferencesNotes: preferencesNotesSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  parents: z.array(parentLinkSchema).optional(),
});

export const auditLogsQuerySchema = paginationSchema.extend({
  action: z.preprocess(emptyToUndefined, z.string().max(60).optional()),
  actorUserId: z.preprocess(emptyToUndefined, uuidV4Schema.optional()),
  actorRole: z.preprocess(emptyToUndefined, userRoleSchema.optional()),
  from: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
  to: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
});
