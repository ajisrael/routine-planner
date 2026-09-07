import type { Task, TaskCadence } from "@planner/shared";
import { eventsOfTask, ruleForTask } from "../../store";

export interface ScaleStat {
  defined: number;
  placed: number;
  /** Non-empty and every defined task is placed. */
  complete: boolean;
}

/** Active tasks carrying the given built-in cadence. */
export function tasksOfCadence(tasks: Task[], cadence: TaskCadence): Task[] {
  return tasks.filter((t) => t.active && t.cadence === cadence);
}

/** A task counts as placed once its rule is real and occurrences exist. */
export function isPlaced(taskId: number): boolean {
  const rule = ruleForTask(taskId);
  if (!rule || rule.ruleType === "none") return false;
  return eventsOfTask(taskId).length > 0;
}

export function scaleStat(tasks: Task[], cadence: TaskCadence): ScaleStat {
  const ts = tasksOfCadence(tasks, cadence);
  const placed = ts.filter((t) => isPlaced(t.id)).length;
  const defined = ts.length;
  return { defined, placed, complete: defined > 0 && placed === defined };
}