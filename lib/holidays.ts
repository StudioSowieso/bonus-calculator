// Nederlandse feestdagen. Alle datums zijn ISO-strings (YYYY-MM-DD), zonder tijdzone-gedoe.

export interface HolidayDef {
  id: string;
  name: string;
  defaultOn: boolean;
}

export interface Holiday extends HolidayDef {
  date: string;
}

export const HOLIDAY_DEFS: HolidayDef[] = [
  { id: "nieuwjaar", name: "Nieuwjaarsdag", defaultOn: true },
  { id: "goedevrijdag", name: "Goede Vrijdag", defaultOn: false },
  { id: "paas1", name: "Eerste Paasdag", defaultOn: true },
  { id: "paas2", name: "Tweede Paasdag", defaultOn: true },
  { id: "koningsdag", name: "Koningsdag", defaultOn: true },
  { id: "bevrijdingsdag", name: "Bevrijdingsdag", defaultOn: false },
  { id: "hemelvaart", name: "Hemelvaartsdag", defaultOn: true },
  { id: "pinkster1", name: "Eerste Pinksterdag", defaultOn: true },
  { id: "pinkster2", name: "Tweede Pinksterdag", defaultOn: true },
  { id: "kerst1", name: "Eerste Kerstdag", defaultOn: true },
  { id: "kerst2", name: "Tweede Kerstdag", defaultOn: true },
];

export function defaultHolidayOn(): Record<string, boolean> {
  return Object.fromEntries(HOLIDAY_DEFS.map((h) => [h.id, h.defaultOn]));
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = maandag ... 6 = zondag */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Aantal dagen van a naar b (b - a), beide ISO-strings. */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Eerste Paasdag (anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(year, month, day);
}

export function holidayList(year: number): Holiday[] {
  const easter = easterSunday(year);
  // Koningsdag: 27 april, bij een zondag 26 april.
  const kd = toISO(year, 4, 27);
  const koningsdag = weekdayIndex(kd) === 6 ? toISO(year, 4, 26) : kd;
  const dates: Record<string, string> = {
    nieuwjaar: toISO(year, 1, 1),
    goedevrijdag: addDays(easter, -2),
    paas1: easter,
    paas2: addDays(easter, 1),
    koningsdag,
    bevrijdingsdag: toISO(year, 5, 5),
    hemelvaart: addDays(easter, 39),
    pinkster1: addDays(easter, 49),
    pinkster2: addDays(easter, 50),
    kerst1: toISO(year, 12, 25),
    kerst2: toISO(year, 12, 26),
  };
  return HOLIDAY_DEFS.map((def) => ({ ...def, date: dates[def.id] }));
}

/** Datum -> naam, alleen voor feestdagen die aanstaan. */
export function holidayMap(
  year: number,
  holidayOn: Record<string, boolean>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holidayList(year)) {
    if (holidayOn[h.id] ?? h.defaultOn) map.set(h.date, h.name);
  }
  return map;
}
