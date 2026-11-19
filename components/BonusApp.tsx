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
    "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-700";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Bonus-checker</h1>
        <p className="mt-1 text-slate-700">
          Plan je verlof en zie meteen of je de maandelijkse omzetdrempel voor je 5%-prestatiebonus nog haalt.
          Je gegevens blijven in je eigen browser.
        </p>
      </header>

      <section aria-labelledby="gegevens" className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
        <h2 id="gegevens" className="text-lg font-semibold">
          Jouw gegevens
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="salary" className="block text-sm font-medium">
              Bruto maandsalaris (fulltime-basis)
            </label>
            <input id="salary" inputMode="decimal" className={input} value={salary}
              onChange={(e) => setSalary(e.target.value)} placeholder="bijv. 4000" />
            <p className="mt-1 text-xs text-slate-600">In €. Wordt omgerekend naar jouw uren (uren ÷ 40).</p>
          </div>
          <div>
            <label htmlFor="hours" className="block text-sm font-medium">
              Uren per week
            </label>
            <input id="hours" inputMode="decimal" className={input} value={hours}
              onChange={(e) => setHours(e.target.value)} placeholder="bijv. 36" />
          </div>
          <div>
            <label htmlFor="rate" className="block text-sm font-medium">
              Tarief per uur (excl. btw)
            </label>
            <input id="rate" inputMode="decimal" className={input} value={rate}
              onChange={(e) => setRate(e.target.value)} placeholder="bijv. 95" />
            <p className="mt-1 text-xs text-slate-600">In €. Wat je werkgever van de klant ontvangt.</p>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Op welke dagen werk je?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WORKDAY_LABELS.map((label, i) => (
              <label key={label}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-400 bg-white px-3 py-2 has-[:checked]:border-blue-800 has-[:checked]:bg-blue-50">
                <input type="checkbox" checked={workdays[i]}
                  onChange={() => setWorkdays((w) => w.map((v, j) => (j === i ? !v : v)))} />
                {label}
              </label>
            ))}
          </div>
          {workdays[4] && (
            <div className="mt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={altFriday} onChange={() => setAltFriday((v) => !v)} />
                Ik ben om de week op vrijdag vrij
              </label>
              {altFriday && (
                <div className="mt-2 max-w-xs">
                  <label htmlFor="altref" className="block text-sm font-medium">
                    Een vrije vrijdag
                  </label>
                  <input id="altref" type="date" className={input} value={altFridayRef}
                    onChange={(e) => setAltFridayRef(e.target.value)}
                    aria-describedby="altref-hint" aria-invalid={altInvalid || undefined} />
                  <p id="altref-hint" className={`mt-1 text-xs ${altInvalid ? "text-red-800" : "text-slate-600"}`}>
                    {altInvalid
                      ? "Kies een datum die op een vrijdag valt. Dit mag een vrije vrijdag uit het verleden of de toekomst zijn."
                      : "Kies een vrijdag waarop je vrij bent. Elke 2 weken daarvoor en daarna is ook vrij."}
                  </p>
                </div>
              )}
            </div>
          )}
          {hpd > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              Dat is {dec(hpd)} declarabele uur per werkdag
              {altActive && !altInvalid ? " (gemiddeld 4,5 dag per week bij om de week vrij op vrijdag)" : ""}.
            </p>
          )}
        </fieldset>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Feestdagen die niet declarabel zijn (aanpassen)
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {holidayList(year).map((h) => (
              <label key={h.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={holidayOn[h.id] ?? h.defaultOn}
                  onChange={() => setHolidayOn((o) => ({ ...o, [h.id]: !(o[h.id] ?? h.defaultOn) }))} />
                {h.name} <span className="text-slate-600">({longDate(h.date)})</span>
              </label>
            ))}
          </div>
        </details>
      </section>

      {!ready ? (
        <p role="status" className="rounded-xl border border-amber-500 bg-amber-50 p-4">
          Vul je salaris, uren per week en tarief in en kies minstens één werkdag om de kalender te gebruiken.
        </p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <section aria-labelledby="kalender" className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => go(-1)}
                  className="rounded-md border border-slate-400 px-3 py-2 hover:bg-slate-100"
                  aria-label="Vorige maand">←</button>
                <h2 id="kalender" aria-live="polite" className="text-lg font-semibold capitalize">
                  {monthName(year, month)} {year}
                </h2>
                <button type="button" onClick={() => go(1)}
                  className="rounded-md border border-slate-400 px-3 py-2 hover:bg-slate-100"
                  aria-label="Volgende maand">→</button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-700">
                {DAY_LABELS.map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} />;
                  const iso = toISO(year, month, day);
                  const wi = weekdayIndex(iso);
                  const holName = hol.get(iso);
                  const isWork = wi <= 4 && settings.workdays[wi];
                  const onLeave = leave.has(iso);
                  const base = "flex h-14 flex-col items-center justify-center rounded-md border text-sm sm:h-16";
                  if (!isWork || isAlternateOffDay(iso, settings)) {
                    return (
                      <div key={iso} className={`${base} border-transparent bg-slate-100 text-slate-500`}
                        aria-label={isWork ? `${longDate(iso)}: vrij (om de week)` : undefined}>
                        <span>{day}</span>
                        {isWork && <span className="text-[10px]">vrij</span>}
                        {holName && <span className="px-0.5 text-[10px] leading-tight">{holName}</span>}
                      </div>
                    );
                  }
                  if (holName) {
                    return (
                      <div key={iso} className={`${base} border-amber-600 bg-amber-100 text-amber-950`}
                        aria-label={`${longDate(iso)}: ${holName}, niet declarabel`}>
                        <span className="font-semibold">{day}</span>
                        <span className="px-0.5 text-[10px] leading-tight">{holName}</span>
                      </div>
                    );
                  }
                  return (
                    <button key={iso} type="button" aria-pressed={onLeave} onClick={() => toggleLeave(iso)}
                      aria-label={`${longDate(iso)}, ${onLeave ? "verlof" : "werkdag"}`}
                      className={`${base} cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 ${
                        onLeave
                          ? "border-blue-900 bg-blue-800 text-white"
                          : "border-slate-300 bg-white hover:bg-blue-50"
                      }`}>
                      <span className="font-semibold">{day}</span>
                      <span className="text-[10px]">{onLeave ? "verlof" : `${dec(hpd)} u`}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                <span>Klik op een werkdag om verlof aan of uit te zetten.</span>
                <button type="button" onClick={clearMonth}
                  className="rounded-md border border-slate-400 px-2 py-1 hover:bg-slate-100">
                  Verlof deze maand wissen
                </button>
              </div>
            </section>

            <ResultCard
              title={current.combined ? `${monthName(year, current.from)} + ${monthName(year, current.from + 1)}` : `${monthName(year, month)}`}
              ev={current.ev}
              stats={statsFor(month)}
              hpd={hpd}
              combined={current.combined}
              pairUsed={pair !== undefined}
              onCombine={() => {
                // Maand + volgende, binnen hetzelfde jaar (dus december kan niet).
                const start = month === 12 ? 11 : month;
                setPairStart((p) => ({ ...p, [yearKey]: start }));
              }}
              onSplit={() =>
                setPairStart((p) => {
                  const n = { ...p };
                  delete n[yearKey];
                  return n;
                })
              }
            />
          </div>

          <section aria-labelledby="jaar" className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <h2 id="jaar" className="text-lg font-semibold">Jaaroverzicht {year}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {yearOverview.map((r, i) => {
                const m = i + 1;
                return (
                  <li key={m}>
                    <button type="button" onClick={() => setView({ year, month: m })}
                      aria-current={m === month ? "true" : undefined}
                      className={`w-full rounded-md border p-2 text-left text-sm hover:bg-slate-50 ${
                        m === month ? "border-blue-800 ring-1 ring-blue-800" : "border-slate-300"
                      }`}>
                      <span className="block font-semibold capitalize">{monthName(year, m)}</span>
                      <span className={r.ev.achieved ? "text-green-800" : "text-red-800"}>
                        {r.ev.achieved ? "✓ Gehaald" : "✗ Niet gehaald"}
                      </span>
                      {r.combined && <span className="block text-xs text-slate-700">2-maandsregeling</span>}
                      {r.ev.achieved && !r.combined && (
                        <span className="block text-xs text-slate-700">{eur(r.ev.bonus)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-sm">
              Verwachte bonus dit jaar (bruto):{" "}
              <strong>{eur(yearBonus)}</strong>
            </p>
          </section>
        </>
      )}

      <footer className="pb-8 text-xs text-slate-600">
        <p>
          Rekenregel: drempel = 2,5 × bruto maandsalaris (naar rato van je uren). Haal je meer omzet dan de
          drempel, dan is de bonus 5% van de <em>hele</em> omzet van die maand. Eén keer per jaar mag je twee
          opeenvolgende maanden samenvoegen met een drempel van 5 × het maandsalaris. Dit is een schatting:
          raadpleeg je contract en je werkgever voor de definitieve uitkomst.
        </p>
      </footer>
    </main>
  );
}

function ResultCard(props: {
  title: string;
  ev: Evaluation;
  stats: { billableDays: number; holidays: number; leaveDays: number; hours: number };
  hpd: number;
  combined: boolean;
  pairUsed: boolean;
  onCombine: () => void;
  onSplit: () => void;
}) {
  const { ev, stats, combined } = props;
  return (
    <section aria-labelledby="uitkomst" className="h-fit rounded-xl bg-white p-4 shadow-sm sm:p-6">
      <h2 id="uitkomst" className="text-lg font-semibold capitalize">Uitkomst {props.title}</h2>
      <div
        role="status"
        className={`mt-3 rounded-lg border p-3 font-semibold ${
          ev.achieved
            ? "border-green-700 bg-green-50 text-green-950"
            : "border-red-700 bg-red-50 text-red-950"
        }`}
      >
        {ev.achieved ? "✓ Drempel gehaald" : "✗ Drempel niet gehaald"}
        <div className="text-2xl">{eur(ev.bonus)} <span className="text-sm font-normal">bonus (bruto)</span></div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt>Declarabele uren{combined ? " (2 mnd)" : ""}</dt>
        <dd className="text-right font-medium">{dec(ev.hours)} u</dd>
        <dt>Nodig voor drempel</dt>
        <dd className="text-right font-medium">&gt; {dec(ev.neededHours)} u</dd>
        <dt>Omzet</dt>
        <dd className="text-right font-medium">{eur(ev.revenue)}</dd>
        <dt>Drempel</dt>
        <dd className="text-right font-medium">{eur(ev.threshold)}</dd>
        <dt>Verlofdagen (deze maand)</dt>
        <dd className="text-right font-medium">{stats.leaveDays}</dd>
        <dt>Feestdagen op werkdagen</dt>
        <dd className="text-right font-medium">{stats.holidays}</dd>
      </dl>

      <p className="mt-4 text-sm">
        {ev.achieved
          ? ev.extraLeaveDays > 0
            ? `Je kunt nog ${ev.extraLeaveDays} extra verlofdag${ev.extraLeaveDays === 1 ? "" : "en"} nemen en toch je bonus houden.`
            : "Je zit precies op de grens: nog een verlofdag en je mist de drempel."
          : `Je komt ${dec(ev.shortHours)} uur tekort. Haal ${ev.daysNeeded} verlofdag${ev.daysNeeded === 1 ? "" : "en"} terug uit je planning (of werk extra) om over de drempel te komen.`}
      </p>

      <div className="mt-4 border-t pt-4 text-sm">
        {combined ? (
          <>
            <p>Deze maand telt mee in je 2-maandsregeling (drempel 5 × salaris).</p>
            <button type="button" onClick={props.onSplit}
              className="mt-2 rounded-md border border-slate-400 px-3 py-2 hover:bg-slate-100">
              Terug naar losse maanden
            </button>
          </>
        ) : (
          <>
            <p>Eén keer per jaar mag je deze maand en de volgende samenvoegen.</p>
            <button type="button" onClick={props.onCombine}
              className="mt-2 rounded-md border border-slate-400 px-3 py-2 hover:bg-slate-100">
              {props.pairUsed ? "Verplaats mijn 2-maandsregeling hierheen" : "Gebruik 2-maandsregeling"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
