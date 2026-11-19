"use client";

import { useEffect, useMemo, useState } from "react";
import {
  evaluate,
  hoursPerDay,
  isAlternateOffDay,
  monthStats,
  validAlternateFriday,
  workdayCount,
  type Evaluation,
  type Settings,
} from "@/lib/calc";
import {
  daysInMonth,
  defaultHolidayOn,
  holidayList,
  holidayMap,
  toISO,
  weekdayIndex,
} from "@/lib/holidays";

const STORAGE_KEY = "bonus-checker-v1";
const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const WORKDAY_LABELS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];

interface Stored {
  salary: string;
  hours: string;
  rate: string;
  workdays: boolean[];
  holidayOn: Record<string, boolean>;
  leave: string[];
  pairStart: Record<string, number>;
  altFriday?: boolean;
  altFridayRef?: string;
}

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const eur = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const dec = (n: number) =>
  new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(n);

const monthName = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("nl-NL", {
    month: "long",
    timeZone: "UTC",
  });
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function BonusApp() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState({ year: 2026, month: 1 });
  const [salary, setSalary] = useState("");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [workdays, setWorkdays] = useState([true, true, true, true, true]);
  const [holidayOn, setHolidayOn] = useState<Record<string, boolean>>(defaultHolidayOn());
  const [leave, setLeave] = useState<Set<string>>(new Set());
  const [pairStart, setPairStart] = useState<Record<string, number>>({});
  const [altFriday, setAltFriday] = useState(false);
  const [altFridayRef, setAltFridayRef] = useState("");

  // Laden en opslaan: alleen lokaal in de browser.
  useEffect(() => {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() + 1 });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Stored>;
        if (typeof s.salary === "string") setSalary(s.salary);
        if (typeof s.hours === "string") setHours(s.hours);
        if (typeof s.rate === "string") setRate(s.rate);
        if (Array.isArray(s.workdays) && s.workdays.length === 5) setWorkdays(s.workdays);
        if (s.holidayOn) setHolidayOn({ ...defaultHolidayOn(), ...s.holidayOn });
        if (Array.isArray(s.leave)) setLeave(new Set(s.leave));
        if (s.pairStart) setPairStart(s.pairStart);
        if (typeof s.altFriday === "boolean") setAltFriday(s.altFriday);
        if (typeof s.altFridayRef === "string") setAltFridayRef(s.altFridayRef);
      }
    } catch {
      /* opslag niet beschikbaar: geen probleem */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      const data: Stored = {
        salary,
        hours,
        rate,
        workdays,
        holidayOn,
        leave: [...leave],
        pairStart,
        altFriday,
        altFridayRef,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* negeren */
    }
  }, [loaded, salary, hours, rate, workdays, holidayOn, leave, pairStart, altFriday, altFridayRef]);

  const settings: Settings = useMemo(
    () => ({
      fulltimeSalary: num(salary),
      hoursPerWeek: num(hours),
      rate: num(rate),
      workdays,
      holidayOn,
      alternateFriday: altFriday && workdays[4] ? altFridayRef || null : null,
    }),
    [salary, hours, rate, workdays, holidayOn, altFriday, altFridayRef],
  );

  const altActive = altFriday && workdays[4];
  const altInvalid = altActive && !validAlternateFriday(altFridayRef);

  const ready =
    settings.fulltimeSalary > 0 &&
    settings.hoursPerWeek > 0 &&
    settings.rate > 0 &&
    workdayCount(settings) > 0 &&
    !altInvalid;

  const { year, month } = view;
  const yearKey = String(year);
  const pair = pairStart[yearKey];

  const statsFor = (m: number) => monthStats(year, m, settings, leave);

  /** Beoordeling voor maand m, rekening houdend met een gekozen 2-maanden-periode. */
  const evalFor = (m: number): { ev: Evaluation; combined: boolean; from: number } => {
    if (pair && (m === pair || m === pair + 1)) {
      return { ev: evaluate([statsFor(pair), statsFor(pair + 1)], settings), combined: true, from: pair };
    }
    return { ev: evaluate([statsFor(m)], settings), combined: false, from: m };
  };

  const current = evalFor(month);
  const periodMonths = current.combined ? [current.from, current.from + 1] : [month];
  const periodLeave = periodMonths.reduce((n, m) => n + statsFor(m).leaveDays, 0);
  const periodHolidays = periodMonths.reduce((n, m) => n + statsFor(m).holidays, 0);
  const yearOverview = useMemo(
    () => Array.from({ length: 12 }, (_, i) => evalFor(i + 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, settings, leave, pair],
  );
  const yearBonus = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const r = yearOverview[m - 1];
      if (r.combined && m === r.from + 1) continue; // 2-maandsbonus 1x tellen
      total += r.ev.bonus;
    }
    return total;
  }, [yearOverview]);

  const hol = useMemo(() => holidayMap(year, holidayOn), [year, holidayOn]);
  const hpd = hoursPerDay(settings);

  const go = (delta: number) => {
    const idx = year * 12 + (month - 1) + delta;
    setView({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  };

  const toggleLeave = (iso: string) => {
    setLeave((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const clearMonth = () => {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    setLeave((prev) => new Set([...prev].filter((d) => !d.startsWith(prefix))));
  };

  const firstOffset = weekdayIndex(toISO(year, month, 1));
  const dim = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array<null>(firstOffset).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];


  if (!loaded) {
    return <main className="mx-auto max-w-[1200px] p-6">Laden…</main>;
  }

  const missing: string[] = [];
  if (settings.fulltimeSalary <= 0) missing.push("salaris");
  if (settings.hoursPerWeek <= 0) missing.push("uren per week");
  if (settings.rate <= 0) missing.push("uurtarief");
  if (workdayCount(settings) === 0) missing.push("minstens één werkdag");
  if (altInvalid) missing.push("een geldige vrije vrijdag");

  const ev = current.ev;
  const periodTitle = current.combined
    ? `${monthName(year, current.from)} en ${monthName(year, current.from + 1)}`
    : monthName(year, month);

  const input =
    "mt-1.5 block h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink";
  const lineBtn =
    "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-sm font-medium hover:border-ink";
  const navBtn =
    "size-11 shrink-0 rounded-full border border-line bg-surface text-lg hover:border-ink";
  const card = "rounded-3xl bg-surface p-5 shadow-[0_6px_20px_rgba(31,58,52,0.07)] sm:p-6";

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8">
      <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
            <span aria-hidden="true" className="inline-flex size-[34px] items-center justify-center rounded-[10px] bg-forest text-mint">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            Bonus-checker
          </h1>
          <p className="text-sm text-muted">Haal ik mijn drempel als ik verlof neem?</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="mt-2 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Linkerkolom: kalender + jaaroverzicht */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-6">
          <section aria-labelledby="kalender" className={`${card} order-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => go(-1)} aria-label="Vorige maand" className={navBtn}>←</button>
                <h2 id="kalender" aria-live="polite" className="min-w-40 text-center text-2xl font-semibold capitalize tracking-tight sm:min-w-52 sm:text-[32px]">
                  {monthName(year, month)} {year}
                </h2>
                <button type="button" onClick={() => go(1)} aria-label="Volgende maand" className={navBtn}>→</button>
              </div>
              <button type="button" onClick={clearMonth} className={lineBtn}>Verlof wissen</button>
            </div>
            <p className="mb-5 mt-3 text-sm text-muted">Klik op een werkdag om verlof aan of uit te zetten.</p>

            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((d) => (
                <div key={d} className="pb-1 text-center text-sm font-medium text-muted">{d}</div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const iso = toISO(year, month, day);
                const wi = weekdayIndex(iso);
                const holName = hol.get(iso);
                const isWork = wi <= 4 && settings.workdays[wi];
                const offFriday = isWork && isAlternateOffDay(iso, settings);
                const onLeave = leave.has(iso);
                const cell =
                  "flex h-16 flex-col justify-between rounded-[14px] p-2 text-left sm:h-[84px] sm:px-3 sm:py-2.5";
                if (!isWork || offFriday) {
                  return (
                    <div key={iso}
                      aria-label={offFriday ? `${longDate(iso)}: vrij (om de week)` : undefined}
                      className={`${cell} text-muted ${offFriday ? "border border-dashed border-line" : ""}`}>
                      <span className="text-[15px]">{day}</span>
                      {offFriday ? (
                        <span className="text-xs">vrij</span>
                      ) : holName ? (
                        <span className="text-[11px] leading-tight">{holName}</span>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                }
                if (holName) {
                  return (
                    <div key={iso} className={`${cell} hatch text-ink`}
                      aria-label={`${longDate(iso)}: ${holName}, niet declarabel`}>
                      <span className="text-[15px] font-semibold">{day}</span>
                      <span className="text-[11px] font-medium leading-tight">{holName}</span>
                    </div>
                  );
                }
                return (
                  <button key={iso} type="button" aria-pressed={onLeave} onClick={() => toggleLeave(iso)}
                    aria-label={`${longDate(iso)}, ${onLeave ? "verlof" : "werkdag"}`}
                    className={`${cell} cursor-pointer transition-colors duration-150 ${
                      onLeave ? "bg-forest text-white" : "bg-cell text-ink hover:bg-cell-hover"
                    }`}>
                    <span className="text-[15px] font-semibold">{day}</span>
                    <span className={`tnum text-xs ${onLeave ? "text-mint" : "text-muted"}`}>
                      {onLeave ? "verlof" : hpd > 0 ? `${dec(hpd)} u` : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 rounded bg-cell ring-1 ring-line" />werkdag</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 rounded bg-forest" />verlof</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="hatch inline-block size-3.5 rounded" />feestdag, niet declarabel</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 rounded border border-dashed border-line" />vrij</li>
            </ul>
          </section>

          <section aria-labelledby="jaar" className={`${card} order-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="jaar" className="text-2xl font-semibold tracking-tight">Jaaroverzicht {year}</h2>
              <p className="text-[15px] text-muted">
                Verwachte bonus: <strong className="tnum text-ink">{eur(yearBonus)}</strong> bruto
              </p>
            </div>
            <p className="mt-1.5 text-[13px] text-muted">Elke balk toont je omzet ten opzichte van de drempel (de streep).</p>
            <ul className="mt-4 grid grid-cols-6 gap-1 sm:grid-cols-12">
              {yearOverview.map((r, i) => {
                const m = i + 1;
                const ratio = r.ev.threshold > 0 ? r.ev.revenue / r.ev.threshold : 0;
                const h = Math.min(ratio / 1.6, 1) * 100;
                return (
                  <li key={m}>
                    <button type="button" onClick={() => setView({ year, month: m })}
                      aria-current={m === month ? "true" : undefined}
                      className={`w-full rounded-[14px] px-1 py-2 text-center hover:bg-cell ${m === month ? "bg-cell" : ""}`}>
                      <span className="relative block h-[130px] border-b border-line">
                        <span aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-muted/60" style={{ bottom: `${100 / 1.6}%` }} />
                        <span aria-hidden="true"
                          className={`absolute inset-x-1.5 bottom-0 rounded-t-md transition-[height] duration-500 ${!ready ? "bg-line" : r.ev.achieved ? "bg-ok" : "bg-bad"}`}
                          style={{ height: `${h}%` }} />
                      </span>
                      <span className="mt-2 block text-sm font-semibold">
                        {new Date(Date.UTC(year, i, 1)).toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" })}
                      </span>
                      <span className={`block text-xs font-medium ${!ready ? "text-muted" : r.ev.achieved ? "text-ok" : "text-bad"}`}>
                        {!ready ? "–" : r.ev.achieved ? "✓ gehaald" : "✗ niet"}
                      </span>
                      {r.combined && <span className="block text-[11px] text-muted">2 mnd</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Rechterkolom: uitkomst + gegevens */}
        <div className="contents lg:flex lg:w-[400px] lg:flex-none lg:flex-col lg:gap-6">
          <section aria-labelledby="uitkomst"
            className="relative order-1 overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-[0_18px_40px_rgba(31,58,52,0.25)] sm:p-7">
            <svg aria-hidden="true" viewBox="0 0 400 160" fill="none" className="pointer-events-none absolute -right-8 -top-5 w-[400px]">
              <path d="M20 30C90 0 140 100 210 80S320 0 430 60" stroke="var(--color-forest-line)" strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" />
              <path d="M50 90C120 60 170 160 240 140S350 60 460 120" stroke="var(--color-forest-line)" strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" />
            </svg>
            <div className="relative">
              <h2 id="uitkomst" className="text-xl font-medium text-forest-text">Uitkomst {periodTitle}</h2>
              <p role="status" aria-live="polite"
                className={`mt-3.5 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[15px] font-semibold ${
                  !ready ? "bg-white/15 text-white" : ev.achieved ? "bg-mint text-[#1f3a34]" : "bg-salmon text-[#1f3a34]"
                }`}>
                {!ready ? "Vul je gegevens in" : ev.achieved ? "✓ Je haalt de drempel" : "✗ Je haalt de drempel niet"}
              </p>

              <Gauge hours={ev.hours} needed={ev.neededHours} ok={ev.achieved} ready={ready} bonus={ev.bonus} />
              <p className="mt-1 text-center text-xs text-forest-text">
                {ready ? `De streep is je drempel: ${dec(ev.neededHours)} u.` : " "}
              </p>

              <p className="mb-4 mt-3 min-h-[3.5rem] text-base leading-snug">
                {!ready
                  ? `Nog nodig: ${missing.join(", ")}.`
                  : ev.achieved
                    ? ev.extraLeaveDays > 0
                      ? <>Je kunt nog <strong className="text-mint">{ev.extraLeaveDays} extra verlofdag{ev.extraLeaveDays === 1 ? "" : "en"}</strong> nemen en je bonus houden.</>
                      : "Je zit precies op de grens: nog één verlofdag en je mist de drempel."
                    : `Je komt ${dec(ev.shortHours)} uur tekort. Haal ${ev.daysNeeded} verlofdag${ev.daysNeeded === 1 ? "" : "en"} uit je planning of werk extra om de drempel te halen.`}
              </p>

              <dl className="tnum">
                {[
                  ["Declarabele uren", ready ? `${dec(ev.hours)} u` : "–"],
                  ["Nodig voor de drempel", ready ? `meer dan ${dec(ev.neededHours)} u` : "–"],
                  ["Omzet", ready ? eur(ev.revenue) : "–"],
                  ["Drempel", ready ? eur(ev.threshold) : "–"],
                  ["Verlofdagen", String(periodLeave)],
                  ["Feestdagen op een werkdag", String(periodHolidays)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-t border-forest-line py-2.5 text-[15px]">
                    <dt className="text-forest-text">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4">
                {current.combined ? (
                  <button type="button" className={mintBtn}
                    onClick={() => setPairStart((p) => { const n = { ...p }; delete n[yearKey]; return n; })}>
                    Terug naar losse maanden
                  </button>
                ) : (
                  <button type="button" disabled={!ready} className={`${mintBtn} disabled:cursor-not-allowed disabled:opacity-50`}
                    onClick={() => {
                      const start = month === 12 ? 11 : month; // binnen hetzelfde jaar
                      setPairStart((p) => ({ ...p, [yearKey]: start }));
                    }}>
                    {pair !== undefined ? "Verplaats 2-maandsregeling hierheen" : "Gebruik 2-maandsregeling (1× per jaar)"}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="gegevens" className={`${card} order-3`}>
            <h2 id="gegevens" className="text-2xl font-semibold tracking-tight">Jouw gegevens</h2>
            <div className="mt-5 flex flex-col gap-[18px]">
              <div>
                <label htmlFor="salary" className="text-[15px] font-medium">Bruto maandsalaris (fulltime)</label>
                <input id="salary" inputMode="decimal" className={`${input} tnum`} value={salary}
                  onChange={(e) => setSalary(e.target.value)} placeholder="bijv. 4000" />
                <p className="mt-1.5 text-[13px] text-muted">In euro. Wordt omgerekend naar jouw uren (uren ÷ 40).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hours" className="text-[15px] font-medium">Uren per week</label>
                  <input id="hours" inputMode="decimal" className={`${input} tnum`} value={hours}
                    onChange={(e) => setHours(e.target.value)} placeholder="bijv. 36" />
                </div>
                <div>
                  <label htmlFor="rate" className="text-[15px] font-medium">Uurtarief</label>
                  <input id="rate" inputMode="decimal" className={`${input} tnum`} value={rate}
                    onChange={(e) => setRate(e.target.value)} placeholder="bijv. 95" />
                </div>
              </div>
              <p className="-mt-1.5 text-[13px] text-muted">Uurtarief in euro, excl. btw: wat je werkgever van de klant ontvangt.</p>

              <fieldset>
                <legend className="text-[15px] font-medium">Op welke dagen werk je?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WORKDAY_LABELS.map((label, i) => (
                    <label key={label}
                      className="flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 text-[15px] has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus">
                      <input type="checkbox" className="sr-only" checked={workdays[i]}
                        onChange={() => setWorkdays((w) => w.map((v, j) => (j === i ? !v : v)))} />
                      {label.slice(0, 2)}
                      <span className="sr-only">{label.slice(2)}</span>
                    </label>
                  ))}
                </div>
                {workdays[4] && (
                  <div className="mt-3.5">
                    <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                      <input type="checkbox" className="size-[18px] accent-forest" checked={altFriday}
                        onChange={() => setAltFriday((v) => !v)} />
                      Ik ben om de week op vrijdag vrij
                    </label>
                    {altFriday && (
                      <div className="mt-2.5">
                        <label htmlFor="altref" className="text-[15px] font-medium">Een vrije vrijdag</label>
                        <input id="altref" type="date" className={input} value={altFridayRef}
                          onChange={(e) => setAltFridayRef(e.target.value)}
                          aria-describedby="altref-hint" aria-invalid={altInvalid || undefined} />
                        <p id="altref-hint" className={`mt-1.5 text-[13px] ${altInvalid ? "text-bad" : "text-muted"}`}>
                          {altInvalid
                            ? "Kies een datum die op een vrijdag valt. Een vrije vrijdag uit het verleden of de toekomst mag."
                            : "Elke twee weken daarvoor en daarna ben je ook vrij."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {hpd > 0 && (
                  <p className="mt-2.5 text-sm text-muted">
                    Dat zijn {dec(hpd)} declarabele uur per werkdag
                    {altActive && !altInvalid ? " (gemiddeld 4,5 werkdag per week)" : ""}.
                  </p>
                )}
              </fieldset>

              <details className="rounded-xl border border-line bg-cell px-4 py-3.5">
                <summary className="cursor-pointer text-[15px] font-medium">Feestdagen aanpassen</summary>
                <p className="mt-2.5 text-[13px] text-muted">
                  Aangevinkte feestdagen zijn niet declarabel en kosten geen verlofdag.
                </p>
                <div className="mt-2.5 space-y-1.5">
                  {holidayList(year).map((h) => (
                    <label key={h.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1 size-4 accent-forest"
                        checked={holidayOn[h.id] ?? h.defaultOn}
                        onChange={() => setHolidayOn((o) => ({ ...o, [h.id]: !(o[h.id] ?? h.defaultOn) }))} />
                      <span>{h.name} <span className="text-muted">{longDate(h.date)}</span></span>
                    </label>
                  ))}
                </div>
              </details>
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                Je gegevens blijven in je eigen browser.
              </p>
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-10 max-w-[72ch] text-[13px] leading-relaxed text-muted">
        <p>
          Rekenregel: de drempel is 2,5 × je bruto maandsalaris (naar rato van je uren). Is je omzet hoger, dan is
          de bonus 5% van de hele omzet van die maand. Eén keer per jaar mag je twee opeenvolgende maanden
          samenvoegen met een drempel van 5 × je maandsalaris. Dit is een schatting: je contract en je werkgever
          bepalen de uitkomst.
        </p>
      </footer>
    </main>
  );
}

const mintBtn =
  "inline-flex min-h-11 items-center rounded-[10px] border border-mint bg-transparent px-4 text-sm font-medium text-mint hover:bg-mint/10 focus-visible:outline-mint";

function Gauge({
  hours,
  needed,
  ok,
  ready,
  bonus,
}: {
  hours: number;
  needed: number;
  ok: boolean;
  ready: boolean;
  bonus: number;
}) {
  const R = 116;
  const CX = 170;
  const CY = 150;
  const LEN = Math.PI * R;
  const max = Math.max(hours, needed) * 1.12 || 1;
  const fill = ready ? Math.min(hours / max, 1) * LEN : 0;
  const m = ready && needed > 0 ? Math.min(needed / max, 1) : null;
  const arc = `M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (m !== null) {
    const th = Math.PI * m;
    const c = Math.cos(th);
    const s = Math.sin(th);
    tick = { x1: CX - 102 * c, y1: CY - 102 * s, x2: CX - 134 * c, y2: CY - 134 * s };
  }
  const label = ready
    ? `${dec(hours)} declarabele uren, drempel ${dec(needed)} uur`
    : "Meter: vul je gegevens in";
  return (
    <svg role="img" aria-label={label} viewBox="0 0 340 172" className="mt-2 block h-auto w-full">
      <path d={arc} fill="none" stroke="var(--color-forest-track)" strokeWidth="24" strokeLinecap="round" />
      {ready && fill > 0 && (
        <path d={arc} fill="none" strokeWidth="24" strokeLinecap="round"
          stroke={ok ? "var(--color-mint)" : "var(--color-salmon)"}
          strokeDasharray={`${fill} ${LEN}`} style={{ transition: "stroke-dasharray 500ms" }} />
      )}
      {tick && (
        <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="#1f3a34" strokeWidth="4" strokeLinecap="round" />
      )}
      <text x="170" y="122" textAnchor="middle" fontSize="38" fontWeight="700" fill="#fff" letterSpacing="-1"
        style={{ fontVariantNumeric: "tabular-nums" }}>
        {ready ? eur(bonus) : "€ –"}
      </text>
      <text x="170" y="146" textAnchor="middle" fontSize="14" fill="var(--color-forest-text)">bruto bonus</text>
    </svg>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("bonus-theme", next ? "dark" : "light");
    } catch {
      /* negeren */
    }
  };

  return (
    <button type="button" role="switch" aria-checked={dark} onClick={toggle}
      className="flex min-h-10 items-center gap-2.5 rounded-full border border-line bg-surface py-1 pl-3.5 pr-2 text-sm font-medium hover:border-ink">
      Donkere modus
      <span aria-hidden="true"
        className={`relative inline-block h-6 w-10 rounded-full transition-colors duration-200 ${dark ? "bg-forest" : "bg-line"}`}>
        <span className={`absolute left-[3px] top-[3px] size-[18px] rounded-full bg-white transition-transform duration-200 ${dark ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
