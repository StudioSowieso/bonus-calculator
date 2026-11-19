import { daysInMonth, holidayMap, toISO, weekdayIndex } from "./holidays.ts";

export const BONUS_PERCENTAGE = 0.05;
export const THRESHOLD_FACTOR = 2.5; // per maand, x bruto maandsalaris
export const FULLTIME_HOURS = 40;

export interface Settings {
  /** Bruto maandsalaris op fulltime-basis (zoals in het contract). */
  fulltimeSalary: number;
  hoursPerWeek: number;
  /** Tarief per uur dat de werkgever van de klant krijgt, excl. btw. */
  rate: number;
  /** Ma t/m vr: werk je op die dag? */
  workdays: boolean[];
  holidayOn: Record<string, boolean>;
}

export interface MonthStats {
  /** Werkdagen die declarabel zijn (geen feestdag, geen verlof). */
  billableDays: number;
  holidays: number;
  leaveDays: number;
  hours: number;
}

export interface Evaluation {
  months: number;
  hours: number;
  revenue: number;
  salary: number;
  threshold: number;
  neededHours: number;
  achieved: boolean;
  bonus: number;
  /** Uren tekort om de drempel te halen (0 als gehaald). */
  shortHours: number;
  /** Extra verlofdagen die nog kunnen met behoud van de bonus. */
  extraLeaveDays: number;
  /** Extra declarabele dagen nodig als de drempel niet gehaald is. */
  daysNeeded: number;
}

export function workdayCount(s: Settings): number {
  return s.workdays.filter(Boolean).length;
}

export function hoursPerDay(s: Settings): number {
  const n = workdayCount(s);
  return n === 0 ? 0 : s.hoursPerWeek / n;
}

/** Salaris dat voor de drempel telt: fulltime-salaris naar rato van de uren. */
export function effectiveSalary(s: Settings): number {
  return (s.fulltimeSalary * s.hoursPerWeek) / FULLTIME_HOURS;
}

export function monthStats(
  year: number,
  month: number,
  s: Settings,
  leave: ReadonlySet<string>,
): MonthStats {
  const hol = holidayMap(year, s.holidayOn);
  const hpd = hoursPerDay(s);
  let billableDays = 0;
  let holidays = 0;
  let leaveDays = 0;
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const iso = toISO(year, month, d);
    const wi = weekdayIndex(iso);
    if (wi > 4 || !s.workdays[wi]) continue;
    if (hol.has(iso)) {
      holidays++;
    } else if (leave.has(iso)) {
      leaveDays++;
    } else {
      billableDays++;
    }
  }
  return { billableDays, holidays, leaveDays, hours: billableDays * hpd };
}

const cents = (n: number) => Math.round(n * 100);

/** Beoordeel 1 maand, of 2 samengevoegde maanden (drempel 5x salaris). */
export function evaluate(stats: MonthStats[], s: Settings): Evaluation {
  const months = stats.length;
  const hours = stats.reduce((sum, m) => sum + m.hours, 0);
  const salary = effectiveSalary(s);
  const threshold = THRESHOLD_FACTOR * months * salary;
  const revenue = hours * s.rate;
  const hpd = hoursPerDay(s);
  const neededHours = s.rate > 0 ? threshold / s.rate : 0;
  // De drempel moet *overschreden* worden ("hoger dan").
  const achieved = threshold > 0 && cents(revenue) > cents(threshold);
  const slack = hours - neededHours;
  const extraLeaveDays =
    achieved && hpd > 0 ? Math.max(0, Math.ceil(slack / hpd - 1e-9) - 1) : 0;
  const shortHours = achieved ? 0 : Math.max(0, neededHours - hours);
  const daysNeeded = !achieved && hpd > 0 ? Math.floor(shortHours / hpd + 1e-9) + 1 : 0;
  return {
    months,
    hours,
    revenue,
    salary,
    threshold,
    neededHours,
    achieved,
    bonus: achieved ? revenue * BONUS_PERCENTAGE : 0,
    shortHours,
    extraLeaveDays,
    daysNeeded,
  };
}
