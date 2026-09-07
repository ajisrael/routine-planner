import { useMemo, useState } from "react";
import { usePlannerStore } from "../store";
import { PeopleStage } from "../components/setup/PeopleStage";
import PlanView, { type SetupCadence } from "./PlanView";
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
        return <PlanView key={step} setup={"daily" satisfies SetupCadence} />;
      case "weekly":
        return <PlanView key={step} setup={"weekly" satisfies SetupCadence} />;
      case "monthly":
        return <PlanView key={step} setup={"monthly" satisfies SetupCadence} />;
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold leading-tight grow">Guided setup</h2>
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
        </div>
        <ul className="steps steps-xs w-full -translate-x-6 lg:-translate-x-8">
          {steps.map((s, i) => (
            <li
              key={s.short}
              className={`step${i <= idx ? " step-primary" : ""} cursor-pointer`}
              data-content={i < idx ? "✓" : i + 1}
              onClick={() => go(STEPS[i])}
              aria-current={step === STEPS[i] ? "step" : undefined}
              title={`${s.label} - ${s.status}`}
            >
              <span className="text-[11px] whitespace-nowrap">
                {s.short.charAt(0).toUpperCase() + s.short.slice(1)}
                {!s.ok && <span className="badge badge-warning badge-xs ml-1">{s.status}</span>}
              </span>
            </li>
          ))}
        </ul>
      </header>

      <div className="min-h-0 flex-1">{renderStage()}</div>
    </section>
  );
}