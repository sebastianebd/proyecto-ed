export type ParentActiveChild = {
  id: string;
  fullName: string;
  classId: string;
  className: string;
  relationship: string | null;
};

export type ParentAccessContext = {
  activeChildren: ParentActiveChild[];
  currentClassIds: Set<string>;
  historyClassIdsByChild: Map<string, Set<string>>;
  allAccessibleClassIds: Set<string>;
};

/** Regla de desbloqueo de lección para padres (docs/03-seguridad.md §4.1). */
export function isLessonUnlockedForParent(
  lesson: { scheduleStatus: string; unlockAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (lesson.scheduleStatus === "FORCE_UNLOCKED") return true;
  if (lesson.scheduleStatus === "SCHEDULED" && lesson.unlockAt !== null) {
    return now.getTime() >= lesson.unlockAt.getTime();
  }
  return false;
}

/** Retorna los hijos ACTIVE elegibles para una unidad según su clase y estado (`ACTIVE` vs `FINISHED`). */
export function getEligibleChildrenForUnit(
  ctx: ParentAccessContext,
  unit: { classId: string; status: string },
): ParentActiveChild[] {
  if (unit.status === "ACTIVE") {
    return ctx.activeChildren.filter((c) => c.classId === unit.classId);
  }
  if (unit.status === "FINISHED") {
    return ctx.activeChildren.filter(
      (c) => c.classId === unit.classId || ctx.historyClassIdsByChild.get(c.id)?.has(unit.classId),
    );
  }
  return [];
}

/** Valida que todos los `studentIds` solicitados pertenezcan a los hijos activos elegibles de la clase. */
export function validateRequestedStudentIds(
  eligibleChildren: ParentActiveChild[],
  requestedIds: string[],
): string[] | null {
  const allowed = new Set(eligibleChildren.map((c) => c.id));
  const uniqueIds = Array.from(new Set(requestedIds));
  return uniqueIds.every((id) => allowed.has(id)) ? uniqueIds : null;
}
