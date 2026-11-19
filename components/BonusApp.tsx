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
    return <main className="mx-auto max-w-5xl p-6">Laden…</main>;
  }

  const input =
    "mt-1 h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-accent";
  const ghostBtn =
    "rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-ink";

  const missing: string[] = [];
  if (settings.fulltimeSalary <= 0) missing.push("salaris");
  if (settings.hoursPerWeek <= 0) missing.push("uren per week");
  if (settings.rate <= 0) missing.push("uurtarief");
  if (workdayCount(settings) === 0) missing.push("minstens één werkdag");
  if (altInvalid) missing.push("een geldige vrije vrijdag");

  const periodTitle = current.combined
    ? `${monthName(year, current.from)} en ${monthName(year, current.from + 1)}`
    : monthName(year, month);
  const ev = current.ev;
  const st = statsFor(month);

  const form = (
    <section aria-labelledby="gegevens" className="space-y-5">
      <h2 id="gegevens" className="font-display text-xl font-semibold">
        Jouw gegevens
      </h2>
      <div>
        <label htmlFor="salary" className="text-sm font-medium">Bruto maandsalaris (fulltime)</label>
        <input id="salary" inputMode="decimal" className={`${input} tnum`} value={salary}
          onChange={(e) => setSalary(e.target.value)} placeholder="bijv. 4000" />
        <p className="mt-1 text-xs text-muted">In euro. Wordt omgerekend naar jouw uren (uren ÷ 40).</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="hours" className="text-sm font-medium">Uren per week</label>
          <input id="hours" inputMode="decimal" className={`${input} tnum`} value={hours}
            onChange={(e) => setHours(e.target.value)} placeholder="bijv. 36" />
        </div>
        <div>
          <label htmlFor="rate" className="text-sm font-medium">Uurtarief</label>
          <input id="rate" inputMode="decimal" className={`${input} tnum`} value={rate}
            onChange={(e) => setRate(e.target.value)} placeholder="bijv. 95" />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted">
        Uurtarief in euro, excl. btw: wat je werkgever van de klant ontvangt.
      </p>

      <fieldset>
        <legend className="text-sm font-medium">Op welke dagen werk je?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {WORKDAY_LABELS.map((label, i) => (
            <label key={label}
              className="flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-md border border-line bg-surface px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent">
              <input type="checkbox" className="sr-only" checked={workdays[i]}
                onChange={() => setWorkdays((w) => w.map((v, j) => (j === i ? !v : v)))} />
              {label.slice(0, 2)}
              <span className="sr-only">{label.slice(2)}</span>
            </label>
          ))}
        </div>
        {workdays[4] && (
          <div className="mt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-accent" checked={altFriday}
                onChange={() => setAltFriday((v) => !v)} />
              Ik ben om de week op vrijdag vrij
            </label>
            {altFriday && (
              <div className="mt-2">
                <label htmlFor="altref" className="text-sm font-medium">Een vrije vrijdag</label>
                <input id="altref" type="date" className={input} value={altFridayRef}
                  onChange={(e) => setAltFridayRef(e.target.value)}
                  aria-describedby="altref-hint" aria-invalid={altInvalid || undefined} />
                <p id="altref-hint" className={`mt-1 text-xs ${altInvalid ? "text-bad" : "text-muted"}`}>
                  {altInvalid
                    ? "Kies een datum die op een vrijdag valt. Een vrije vrijdag uit het verleden of de toekomst mag."
                    : "Elke twee weken daarvoor en daarna ben je ook vrij."}
                </p>
              </div>
            )}
          </div>
        )}
        {hpd > 0 && (
          <p className="mt-3 text-sm text-muted">
            Dat zijn {dec(hpd)} declarabele uur per werkdag
            {altActive && !altInvalid ? " (gemiddeld 4,5 werkdag per week)" : ""}.
          </p>
        )}
      </fieldset>

      <details className="rounded-md border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">Feestdagen aanpassen</summary>
        <p className="mt-2 text-xs text-muted">
          Aangevinkte feestdagen zijn niet declarabel en kosten geen verlofdag.
        </p>
        <div className="mt-2 space-y-1.5">
          {holidayList(year).map((h) => (
            <label key={h.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-accent"
                checked={holidayOn[h.id] ?? h.defaultOn}
                onChange={() => setHolidayOn((o) => ({ ...o, [h.id]: !(o[h.id] ?? h.defaultOn) }))} />
              <span>
                {h.name} <span className="text-muted">{longDate(h.date)}</span>
              </span>
            </label>
          ))}
        </div>
      </details>
      <p className="text-xs text-muted">Je gegevens blijven in je eigen browser.</p>
    </section>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-xl font-bold sm:text-2xl">Bonus-checker</h1>
          <p className="hidden text-sm text-muted md:block">Haal ik mijn drempel als ik verlof neem?</p>
        </div>
        <ThemeToggle />
      </header>

      {/* Uitkomst: dezelfde opbouw en hoogte, ook als er nog gegevens ontbreken */}
      <section
        aria-labelledby="uitkomst"
        className={`mt-5 rounded-3xl p-5 transition-colors duration-500 sm:p-8 ${
          !ready ? "bg-accent-soft" : ev.achieved ? "bg-ok-tint" : "bg-bad-tint"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Vorige maand"
              className="size-11 rounded-full border border-ink/30 bg-surface/70 text-lg hover:bg-surface">←</button>
            <h2 id="uitkomst" className="font-display min-w-44 text-center text-3xl font-bold capitalize sm:text-5xl">
              {periodTitle}
              <span className="sr-only"> {year}</span>
            </h2>
            <button type="button" onClick={() => go(1)} aria-label="Volgende maand"
              className="size-11 rounded-full border border-ink/30 bg-surface/70 text-lg hover:bg-surface">→</button>
          </div>
          <p className="text-sm text-ink/80">{year}</p>
        </div>

        <div role="status" aria-live="polite" className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <p className={`font-display text-2xl font-semibold sm:text-3xl ${!ready ? "text-ink" : ev.achieved ? "text-ok" : "text-bad"}`}>
            {!ready ? "Vul je gegevens in" : ev.achieved ? "✓ Je haalt de drempel" : "✗ Je haalt de drempel niet"}
          </p>
          <p className="font-display tnum text-4xl font-bold sm:text-6xl">
            {ready ? eur(ev.bonus) : "€ –"}
            <span className="ml-2 text-base font-medium text-ink/80">bruto bonus</span>
          </p>
        </div>

        {ready ? (
          <Gauge hours={ev.hours} needed={ev.neededHours} ok={ev.achieved} />
        ) : (
          <div className="mt-8 h-5 rounded-full bg-surface/80" aria-hidden="true" />
        )}

        <p className="mt-10 min-h-14 text-base sm:min-h-8 sm:text-lg">
          {!ready
            ? `Nog nodig: ${missing.join(", ")}.`
            : ev.achieved
              ? ev.extraLeaveDays > 0
                ? `Je kunt nog ${ev.extraLeaveDays} extra verlofdag${ev.extraLeaveDays === 1 ? "" : "en"} nemen en je bonus houden.`
                : "Je zit precies op de grens: nog één verlofdag en je mist de drempel."
              : `Je komt ${dec(ev.shortHours)} uur tekort. Haal ${ev.daysNeeded} verlofdag${ev.daysNeeded === 1 ? "" : "en"} uit je planning of werk extra om de drempel te halen.`}
        </p>

        <dl className="tnum mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink/20 pt-4 text-sm sm:grid-cols-4">
          <div><dt className="text-muted">Declarabele uren</dt><dd className="text-lg font-semibold">{ready ? `${dec(ev.hours)} u` : "–"}</dd></div>
          <div><dt className="text-muted">Nodig voor de drempel</dt><dd className="text-lg font-semibold">{ready ? `meer dan ${dec(ev.neededHours)} u` : "–"}</dd></div>
          <div><dt className="text-muted">Omzet</dt><dd className="text-lg font-semibold">{ready ? eur(ev.revenue) : "–"}</dd></div>
          <div><dt className="text-muted">Drempel</dt><dd className="text-lg font-semibold">{ready ? eur(ev.threshold) : "–"}</dd></div>
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span>{st.leaveDays} verlofdag{st.leaveDays === 1 ? "" : "en"} · {st.holidays} feestdag{st.holidays === 1 ? "" : "en"} op een werkdag</span>
          {current.combined ? (
            <button type="button" className={ghostBtn} onClick={() =>
              setPairStart((p) => { const n = { ...p }; delete n[yearKey]; return n; })}>
              Terug naar losse maanden
            </button>
          ) : (
            <button type="button" disabled={!ready} className={`${ghostBtn} disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => {
              const start = month === 12 ? 11 : month; // binnen hetzelfde jaar
              setPairStart((p) => ({ ...p, [yearKey]: start }));
            }}>
              {pair !== undefined ? "Verplaats 2-maandsregeling hierheen" : "Gebruik 2-maandsregeling (1× per jaar)"}
            </button>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="kalender" className="min-w-0 lg:order-1">
            <div className="flex items-end justify-between gap-3">
              <h2 id="kalender" className="font-display text-xl font-semibold">
                Verlof plannen in <span className="capitalize">{monthName(year, month)}</span>
              </h2>
              <button type="button" onClick={clearMonth} className={ghostBtn}>Verlof wissen</button>
            </div>
            <p className="mt-1 text-sm text-muted">Klik op een werkdag om verlof aan of uit te zetten.</p>

            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              <div className="grid grid-cols-7 gap-px bg-line">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="bg-paper py-2 text-center text-sm font-medium text-muted">{d}</div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} className="bg-paper" />;
                  const iso = toISO(year, month, day);
                  const wi = weekdayIndex(iso);
                  const holName = hol.get(iso);
                  const isWork = wi <= 4 && settings.workdays[wi];
                  const offFriday = isWork && isAlternateOffDay(iso, settings);
                  const onLeave = leave.has(iso);
                  const cell = "flex h-16 flex-col justify-between p-1.5 text-left sm:h-24 sm:p-2";
                  if (!isWork || offFriday) {
                    return (
                      <div key={iso} className={`${cell} bg-paper text-muted`}
                        aria-label={offFriday ? `${longDate(iso)}: vrij (om de week)` : undefined}>
                        <span className="text-sm">{day}</span>
                        {offFriday && <span className="text-xs">vrij</span>}
                        {holName && !offFriday && <span className="text-[11px] leading-tight">{holName}</span>}
                      </div>
                    );
                  }
                  if (holName) {
                    return (
                      <div key={iso} className={`${cell} hatch text-ink`}
                        aria-label={`${longDate(iso)}: ${holName}, niet declarabel`}>
                        <span className="text-sm font-semibold">{day}</span>
                        <span className="text-[11px] font-medium leading-tight">{holName}</span>
                      </div>
                    );
                  }
                  return (
                    <button key={iso} type="button" aria-pressed={onLeave} onClick={() => toggleLeave(iso)}
                      aria-label={`${longDate(iso)}, ${onLeave ? "verlof" : "werkdag"}`}
                      className={`${cell} cursor-pointer transition-colors duration-150 ${
                        onLeave ? "bg-accent text-white" : "bg-surface hover:bg-accent-soft"
                      }`}>
                      <span className="text-sm font-semibold">{day}</span>
                      <span className={`tnum text-xs ${onLeave ? "text-white" : "text-muted"}`}>
                        {onLeave ? "verlof" : hpd > 0 ? `${dec(hpd)} u` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <li className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border border-line bg-surface" />werkdag</li>
              <li className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-accent" />verlof</li>
              <li className="flex items-center gap-1.5"><span className="hatch inline-block size-3 rounded-sm" />feestdag, niet declarabel</li>
            </ul>
          </section>

        <div className="lg:order-2 lg:border-l lg:border-line lg:pl-8">
          {form}
        </div>
      </div>
      <section aria-labelledby="jaar" className="mt-12">
          <h2 id="jaar" className="font-display text-xl font-semibold">Jaaroverzicht {year}</h2>
          <p className="mt-1 text-sm text-muted">
            Elke balk toont je omzet ten opzichte van de drempel (streep). Verwachte bonus dit jaar:{" "}
            <strong className="tnum text-ink">{eur(yearBonus)}</strong> bruto.
          </p>
          <ul className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
            {yearOverview.map((r, i) => {
              const m = i + 1;
              const ratio = r.ev.threshold > 0 ? r.ev.revenue / r.ev.threshold : 0;
              const h = Math.min(ratio / 1.6, 1) * 100;
              return (
                <li key={m}>
                  <button type="button" onClick={() => setView({ year, month: m })}
                    aria-current={m === month ? "true" : undefined}
                    className={`w-full rounded-lg p-1.5 text-center hover:bg-surface ${m === month ? "bg-surface ring-2 ring-ink" : ""}`}>
                    <span className="relative block h-24 border-b border-line">
                      <span className="absolute inset-x-0 border-t border-dashed border-ink/60" style={{ bottom: `${100 / 1.6}%` }} />
                      <span className={`absolute inset-x-1.5 bottom-0 rounded-t-sm transition-[height] duration-500 ${!ready ? "bg-line" : r.ev.achieved ? "bg-ok" : "bg-bad"}`}
                        style={{ height: `${h}%` }} />
                    </span>
                    <span className="mt-1 block text-xs font-semibold capitalize">
                      {new Date(Date.UTC(year, i, 1)).toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" })}
                    </span>
                    <span className={`block text-xs ${!ready ? "text-muted" : r.ev.achieved ? "text-ok" : "text-bad"}`}>
                      {!ready ? "–" : r.ev.achieved ? "✓ gehaald" : "✗ niet"}
                    </span>
                    {r.combined && <span className="block text-[11px] text-muted">2 mnd</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

      <footer className="mt-12 max-w-prose text-xs text-muted">
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

function Gauge({ hours, needed, ok }: { hours: number; needed: number; ok: boolean }) {
  const max = Math.max(hours, needed) * 1.12 || 1;
  const pct = (hours / max) * 100;
  const mark = (needed / max) * 100;
  const label = Math.min(Math.max(mark, 12), 88);
  return (
    <div className="relative mt-8" role="img"
      aria-label={`${dec(hours)} declarabele uren, drempel ${dec(needed)} uur`}>
      <div className="h-5 overflow-hidden rounded-full bg-surface/80">
        <div className={`h-full rounded-full transition-[width] duration-500 ${ok ? "bg-ok" : "bg-bad"}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="absolute -bottom-1 -top-1 w-0.5 bg-ink" style={{ left: `${mark}%` }} />
      <span className="tnum absolute top-7 -translate-x-1/2 whitespace-nowrap text-xs font-medium"
        style={{ left: `${label}%` }}>
        drempel {dec(needed)} u
      </span>
    </div>
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
      className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-3 pr-2 text-sm font-medium hover:border-ink">
      Donkere modus
      <span aria-hidden="true"
        className={`relative inline-block h-6 w-11 rounded-full transition-colors duration-200 ${dark ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform duration-200 ${dark ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}
