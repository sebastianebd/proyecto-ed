// Helpers de fechas en zona horaria America/Santiago (invariante AGENTS.md).

const TZ = "America/Santiago";
const YMD_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** Fecha calendario actual YYYY-MM-DD en America/Santiago. */
export function todayInSantiago(now: Date = new Date()): string {
  return YMD_FMT.format(now);
}

/** Convierte una fecha/hora local de America/Santiago (YYYY-MM-DD HH:mm:ss.SSS) al instante UTC real (maneja CLT/CLST). */
export function santiagoLocalToUtc(ymd: string, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, second, ms);

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const localHour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    localHour,
    Number(parts.minute),
    Number(parts.second),
    ms,
  );
  const offsetMs = utcGuess - asIfUtc;
  return new Date(utcGuess + offsetMs);
}

export const santiagoDayStartUtc = (ymd: string) => santiagoLocalToUtc(ymd, 0, 0, 0, 0);
export const santiagoDayEndUtc = (ymd: string) => santiagoLocalToUtc(ymd, 23, 59, 59, 999);

const PARTS_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Formateo determinista DD-MM-YYYY en America/Santiago (seguro para SSR/hidratación y fechas YYYY-MM-DD). */
export function formatSantiagoDate(input: string | Date): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return `${d}-${m}-${y}`;
    }
  }
  const parts = Object.fromEntries(PARTS_FMT.formatToParts(new Date(input)).map((p) => [p.type, p.value]));
  return `${parts.day}-${parts.month}-${parts.year}`;
}

/** Formateo determinista DD-MM-YYYY HH:mm en America/Santiago (seguro para SSR/hidratación). */
export function formatSantiagoDateTime(input: string | Date): string {
  const parts = Object.fromEntries(PARTS_FMT.formatToParts(new Date(input)).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.day}-${parts.month}-${parts.year} ${hour}:${parts.minute}`;
}

/** Suma o resta días calendario sobre YYYY-MM-DD (sin desfases de cambio de hora DST). */
export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo .. 6 = sábado) para una fecha YYYY-MM-DD. */
export function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isSundayYmd = (ymd: string) => dayOfWeek(ymd) === 0;

/**
 * Calcula `unlock_at` (lunes siguiente 00:01:00 America/Santiago en UTC) a partir de `class_sunday_date`.
 * Seguro ante transiciones DST CLT/CLST de abril y septiembre.
 */
export function computeUnlockAtFromSunday(classSundayYmd: string): Date {
  const mondayYmd = addCalendarDays(classSundayYmd, 1);
  return santiagoLocalToUtc(mondayYmd, 0, 1, 0, 0);
}

/** Domingo de la semana en curso en America/Santiago (ej. lunes 09:00 -> ayer domingo; domingo 23:30 -> hoy). */
export function currentWeekSundayInSantiago(now: Date = new Date()): string {
  const today = todayInSantiago(now);
  return addCalendarDays(today, -dayOfWeek(today));
}

/**
 * Inicio del lunes actual (`00:00:00.000` America/Santiago -> UTC).
 * Domingo 23:59 Chile sigue perteneciendo a la semana iniciada el lunes anterior; lunes 00:01 abre semana nueva.
 */
export function currentMondayStartUtc(now: Date = new Date()): Date {
  const today = todayInSantiago(now);
  const daysSinceMonday = (dayOfWeek(today) + 6) % 7;
  return santiagoDayStartUtc(addCalendarDays(today, -daysSinceMonday));
}

export function isMondayInSantiago(now: Date = new Date()): boolean {
  return dayOfWeek(todayInSantiago(now)) === 1;
}
