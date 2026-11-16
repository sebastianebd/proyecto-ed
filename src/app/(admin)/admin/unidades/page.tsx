import { asc, inArray } from "drizzle-orm";
import { UnitsManager, type AdminUnitItem } from "@/components/admin/UnitsManager";
import { db } from "@/db";
import { classes, lessons, units } from "@/db/schema";

export default async function AdminUnitsPage() {
  const [unitRows, classOptions] = await Promise.all([
    db
      .select({
        id: units.id,
        classId: units.classId,
        orderNumber: units.orderNumber,
        title: units.title,
        pdfStorageKey: units.pdfStorageKey,
        status: units.status,
        createdAt: units.createdAt,
      })
      .from(units)
      .orderBy(asc(units.classId), asc(units.orderNumber), asc(units.createdAt)),
    db.select({ id: classes.id, name: classes.name, status: classes.status }).from(classes).orderBy(asc(classes.createdAt)),
  ]);

  const classMap = new Map(classOptions.map((c) => [c.id, c.name]));
  const unitIds = unitRows.map((u) => u.id);
  const lessonRows =
    unitIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(inArray(lessons.unitId, unitIds))
          .orderBy(asc(lessons.lessonNumber))
      : [];

  const initialUnits: AdminUnitItem[] = unitRows.map((u) => ({
    ...u,
    status: u.status as AdminUnitItem["status"],
    className: classMap.get(u.classId) ?? "Clase",
    createdAt: u.createdAt.toISOString(),
    lessons: lessonRows
      .filter((l) => l.unitId === u.id)
      .map((l) => ({
        id: l.id,
        unitId: l.unitId,
        lessonNumber: l.lessonNumber,
        title: l.title,
        biblePassage: l.biblePassage,
        parentSummary: l.parentSummary,
        reinforcementQuestions: l.reinforcementQuestions,
        classSundayDate: l.classSundayDate,
        unlockAt: l.unlockAt ? l.unlockAt.toISOString() : null,
        scheduleStatus: l.scheduleStatus as AdminUnitItem["lessons"][number]["scheduleStatus"],
        pushSent: l.pushSent,
      })),
  }));

  return <UnitsManager initialUnits={initialUnits} classOptions={classOptions} />;
}
