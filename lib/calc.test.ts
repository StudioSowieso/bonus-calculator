import { test } from "node:test";
import assert from "node:assert/strict";
import { easterSunday, holidayList } from "./holidays.ts";
import { evaluate, hoursPerDay, isAlternateOffDay, monthStats, type Settings } from "./calc.ts";
import { defaultHolidayOn } from "./holidays.ts";

const iso = (y: number, id: string) =>
  holidayList(y).find((h) => h.id === id)!.date;

test("Pasen", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
});

test("feestdagen 2026", () => {
  assert.equal(iso(2026, "goedevrijdag"), "2026-04-03");
  assert.equal(iso(2026, "paas2"), "2026-04-06");
  assert.equal(iso(2026, "koningsdag"), "2026-04-27");
  assert.equal(iso(2026, "hemelvaart"), "2026-05-14");
  assert.equal(iso(2026, "pinkster2"), "2026-05-25");
});

test("Koningsdag op zondag schuift naar 26 april", () => {
  assert.equal(iso(2025, "koningsdag"), "2025-04-26");
  assert.equal(iso(2027, "koningsdag"), "2027-04-27");
});

const base: Settings = {
  fulltimeSalary: 4000,
  hoursPerWeek: 40,
  rate: 100,
  workdays: [true, true, true, true, true],
  holidayOn: defaultHolidayOn(),
  alternateFriday: null,
};

test("januari 2026: 21 declarabele dagen (1 jan is feestdag)", () => {
  const st = monthStats(2026, 1, base, new Set());
  assert.equal(st.billableDays, 21);
  assert.equal(st.holidays, 1);
  assert.equal(st.hours, 168);
});

test("drempel gehaald en bonus", () => {
  const ev = evaluate([monthStats(2026, 1, base, new Set())], base);
  assert.equal(ev.threshold, 10000);
  assert.equal(ev.neededHours, 100);
  assert.equal(ev.achieved, true);
  assert.equal(ev.revenue, 16800);
  assert.equal(ev.bonus, 840);
  assert.equal(ev.extraLeaveDays, 8); // 168-8*8=104 > 100, 9 dagen: 96
});

test("verlof laat drempel net wel/niet halen", () => {
  const days = (n: number) =>
    new Set(
      ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
       "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15"].slice(0, n),
    );
  assert.equal(evaluate([monthStats(2026, 1, base, days(8))], base).achieved, true);
  const ev9 = evaluate([monthStats(2026, 1, base, days(9))], base);
  assert.equal(ev9.achieved, false);
  assert.equal(ev9.bonus, 0);
  assert.equal(ev9.shortHours, 4);
  assert.equal(ev9.daysNeeded, 1);
});

test("exact op de drempel telt niet (moet hoger zijn)", () => {
  // 100 uur x 100 = 10000 = drempel
  const ev = evaluate([{ billableDays: 12.5, holidays: 0, leaveDays: 0, hours: 100 }], base);
  assert.equal(ev.achieved, false);
});

test("deeltijd: salaris naar rato, uren verdeeld over gekozen dagen", () => {
  const s: Settings = { ...base, hoursPerWeek: 32, workdays: [true, true, true, true, false] };
  const st = monthStats(2026, 3, s, new Set()); // maart 2026: 4 x ma-do... 
  // ma-do in maart 2026: ma 5,12,19,26,2; di 3,10,17,24,31; wo 4,11,18,25; do 5,12,19,26 => 5+5+4+4 = 18
  assert.equal(st.billableDays, 18);
  assert.equal(st.hours, 18 * 8);
  const ev = evaluate([st], s);
  assert.equal(ev.salary, 3200);
  assert.equal(ev.threshold, 8000);
});

test("twee maanden samen: drempel 5x", () => {
  const a = monthStats(2026, 7, base, new Set());
  const b = monthStats(2026, 8, base, new Set());
  const ev = evaluate([a, b], base);
  assert.equal(ev.threshold, 20000);
  assert.equal(ev.months, 2);
});

test("36 uur, om de vrijdag vrij: 8 uur per dag, vrije vrijdagen overgeslagen", () => {
  // 20 nov 2026 is een vrijdag (vrij); 4 dec, 18 dec, 6 nov ook. 13 nov en 27 nov werk je.
  const s: Settings = { ...base, hoursPerWeek: 36, alternateFriday: "2026-11-20" };
  assert.equal(hoursPerDay(s), 8);
  assert.equal(isAlternateOffDay("2026-11-20", s), true);
  assert.equal(isAlternateOffDay("2026-11-06", s), true);
  assert.equal(isAlternateOffDay("2026-12-04", s), true);
  assert.equal(isAlternateOffDay("2026-11-13", s), false);
  assert.equal(isAlternateOffDay("2026-11-27", s), false);
  // Werkdagen november 2026 (ma-vr = 21) minus vrije vrijdagen (6 en 20) minus 0 feestdagen = 19
  const st = monthStats(2026, 11, s, new Set());
  assert.equal(st.billableDays, 19);
  assert.equal(st.hours, 152);
});

test("om-de-week-vrijdag werkt over jaargrenzen heen", () => {
  const s: Settings = { ...base, hoursPerWeek: 36, alternateFriday: "2026-11-20" };
  assert.equal(isAlternateOffDay("2027-01-01", s), true); // 6 weken later... 42 dagen
  assert.equal(isAlternateOffDay("2025-11-07", s), true); // 378 dagen eerder = 27 x 14
  assert.equal(isAlternateOffDay("2025-11-14", s), false);
});

test("ongeldige referentie (geen vrijdag) wordt genegeerd", () => {
  const s: Settings = { ...base, hoursPerWeek: 36, alternateFriday: "2026-11-19" };
  assert.equal(hoursPerDay(s), 7.2);
  assert.equal(isAlternateOffDay("2026-11-20", s), false);
});
