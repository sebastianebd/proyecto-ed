import { z } from "zod";
import { todayInSantiago } from "@/lib/timezone";
import { uuidV4Schema } from "./common";
import { attendanceRecordInputSchema } from "./domain";
import { sundayIsoDateSchema } from "./units";

export const teacherAttendancePutSchema = z.object({
  classId: uuidV4Schema,
  attendanceDate: sundayIsoDateSchema.refine(
    (d) => d <= todayInSantiago(),
    "No se puede registrar asistencia en un domingo futuro",
  ),
  records: z
    .array(attendanceRecordInputSchema)
    .min(1, "Debes enviar al menos un alumno en la lista de asistencia")
    .max(100, "Máximo 100 alumnos por envío")
    .refine(
      (rows) => new Set(rows.map((r) => r.studentId)).size === rows.length,
      "La lista contiene alumnos duplicados",
    ),
});
