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
