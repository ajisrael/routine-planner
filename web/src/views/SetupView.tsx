import { useMemo, useState } from "react";
import { usePlannerStore } from "../store";
import { PeopleStage } from "../components/setup/PeopleStage";
import { DailyStage } from "../components/setup/DailyStage";
import { WeeklyStage } from "../components/setup/WeeklyStage";
import { MonthlyStage } from "../components/setup/MonthlyStage";
import { scaleStat, type ScaleStat } from "../lib/wizard/status";

const STEPS = ["people", "daily", "weekly", "monthly"] as const;
type Step = (typeof STEPS)[number];

interface StepMeta {
  label: string;
  short: string;
  status: string;
  ok: boolean;
  skip: boolean;
}

/**
 * Setup tab: a guided walkthrough over the routine's four scales. The hub
 * summarizes what is defined and placed; stages stay reachable from the cards
 * and Back/Next walks them in order. Skipping a scale is always allowed.
 */
export default function SetupView({
  onSkip,
  onFinish,
}: {
  onSkip: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const tasks = usePlannerStore((s) => s.tasks);
  const users = usePlannerStore((s) => s.users);
  const [step, setStep] = useState<Step>("people");
  const idx = STEPS.indexOf(step);

  const stats = useMemo(
    () => ({
      daily: scaleStat(tasks, "daily"),
      weekly: scaleStat(tasks, "weekly"),
      monthly: scaleStat(tasks, "monthly"),
    }),
    [tasks],
  );

  const steps: StepMeta[] = useMemo(() => {
    const scale = (name: string, s: ScaleStat): StepMeta => ({
      label: `${name} routine`,
      short: name,
      status: s.defined === 0 ? "skip - nothing to add" : s.complete ? "done" : `${s.placed}/${s.defined} placed`,
      ok: s.defined === 0 || s.complete,
      skip: s.defined === 0,
    });
    return [
      {
        label: "People",
        short: "people",
        status: `${users.length} ${users.length === 1 ? "person" : "people"} · you can log in`,
        ok: users.length > 0,
        skip: false,
      },
      scale("Daily", stats.daily),
      scale("Weekly", stats.weekly),
      scale("Monthly", stats.monthly),
    ];
  }, [stats, users.length]);

  const go = (target: Step): void => setStep(target);
  const back = (): void => setStep(STEPS[Math.max(0, idx - 1)]);
  const next = (): void => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)]);

  const renderStage = (): React.JSX.Element => {
    switch (step) {
      case "people":
        return <PeopleStage />;
      case "daily":
        return <DailyStage />;
      case "weekly":
        return <WeeklyStage />;
      case "monthly":
        return <MonthlyStage />;
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <div className="grow">
          <h2 className="text-base font-bold leading-tight">Guided setup</h2>
          <p className="text-[11px] opacity-60 leading-snug">
            Step {idx + 1} of {STEPS.length} · build the routine stays ordinary in the Tasks tab anytime.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={back} disabled={idx === 0} aria-label="Previous step">
          ← Back
        </button>
        {idx < STEPS.length - 1 ? (
          <button className="btn btn-sm btn-primary" onClick={next}>
            Next →
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={onFinish}>
            Done ✓
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={onSkip} title="Skip the walkthrough - the Tasks tab is always available">
          Skip for now →
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <button
            key={s.short}
            onClick={() => go(STEPS[i])}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left ${
              step === STEPS[i] ? "border-primary bg-primary/10" : s.ok ? "border-base-content/15 bg-base-100" : "border-base-content/15 bg-base-100"
            }`}
            aria-pressed={step === STEPS[i]}
          >
            <span className="text-xs font-bold">{s.label}</span>
            <span className={`text-[10px] leading-snug ${s.ok ? "opacity-70" : "text-warning"}`}>{s.status}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">{renderStage()}</div>
    </section>
  );
}