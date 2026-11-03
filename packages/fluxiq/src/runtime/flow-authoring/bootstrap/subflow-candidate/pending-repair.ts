// A failed test's repair, held until it is checked from the failing step (t804;
// the rule "build the whole Flow first; test it whole only when it should work",
// Core's AGENTS.md). E's builder re-tested its whole part from the start after
// every one-step change: five whole tests, each with its start check, for one
// step's repair. Core now holds the repair here, and the subflow trial gate
// (`./subflow-trial-gate.ts`) refuses the part's whole test while one stands.
//
// **What sets it.** A whole test (a `core.test_subflow` call with no `from`)
// whose entry was prepared and that answered `execution_failed` -- not Core's
// own trial runner failing -- or `no`. The step it is repaired on: for a stop,
// the plan key of the proposal's step it stopped at (`stoppedAtKey`, the port's);
// for a no, the first step, in plan order, of the latest proposal whose node is
// not as it was in the judged revision. A stop whose step is not in the latest
// proposal any more (renamed or removed), or a stop the port could not name by
// its plan key (the single-subflow whole test names steps only by number and
// label), is read as a no is. With no such step,
// none is named, and any run from a step that ends checks the repair. Unsure
// and not_judged set nothing: their re-tests stay ungated.
//
// **What clears it.** A from-step run of the latest proposal that starts at or
// before that step and passes it (`passedKeys`), or, with no step named, runs
// to the part's end. A no's repair is cleared only by a revision that is not
// the judged one. A whole test that runs (the exception below) sets it again or
// clears it by what it answers.
//
// **The exception.** A whole test is allowed while a repair stands when the
// step is the part's first step (a run from it is the part less its entry), or
// when the builder says why a run from the step cannot check it
// (`fromStepImpossible`, a sentence): a step that needs state only the start
// makes, say.
//
// **It crosses the briefs of its subflow.** One memory per subflow and plan in
// one build (`../../project-agents/dispatch/run-brief.ts`, `REPAIRS`), so a
// repair brief is held to its build brief's failed test. Absent, each gate keeps
// its own.
import { automationStudioCandidateTrialStop as Stop } from "../candidate/index.ts";
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioSubflowFromStepResult, AutomationStudioSubflowProposal, AutomationStudioSubflowTrialResult } from "./contracts.ts";

/** A whole test that failed, as the repair holds it: the revision it ran and how it failed. */
type Failed = { revision: number; digest: string; verdict: "no" | "execution_failed"; stopKey?: string | undefined; ran: readonly AutomationStudioFlowBootstrapSubflow[] };

/** A step as the builder is told it: its plan key and, where it has one, its label. */
export type AutomationStudioSubflowRepairStep = { key: string; label?: string };

/** What a from-step run did to the repair standing: whether it cleared it, and why not where it did not. */
export type AutomationStudioSubflowRepairChecked = { standing: false } | { standing: true; cleared: boolean; step?: AutomationStudioSubflowRepairStep | undefined; why?: "unchanged" | "started_after" | "not_passed" };

type Latest = Pick<AutomationStudioSubflowProposal, "revision" | "digest" | "subflows">;

/** The repair a failed whole test of one subflow left standing (header). */
export class AutomationStudioSubflowPendingRepair {
  private failed: Failed | undefined;

  /** Whether a failed whole test's repair still waits for its check from a step. */
  get standing(): boolean { return this.failed !== undefined; }

  /**
   * A whole test of `ran` answered `answer` (header): sets the repair, clears
   * it, or leaves it where the answer says nothing of this subflow. Answers the
   * repair it set, for the test's instruction; undefined where it set none.
   */
  afterWholeTest(answer: AutomationStudioSubflowTrialResult, ran: Latest): { step?: AutomationStudioSubflowRepairStep | undefined; verdict: Failed["verdict"] } | undefined {
    if (!answer.entryPrepared) return undefined;
    if (answer.verdict === "execution_failed" && Stop.of(answer.feedback).kind === "trial_runner") return undefined;
    if (answer.verdict !== "no" && answer.verdict !== "execution_failed") {
      this.failed = undefined;
      return undefined;
    }
    const stopKey = answer.verdict === "execution_failed" ? answer.stoppedAtKey : undefined;
    this.failed = { revision: ran.revision, digest: ran.digest, verdict: answer.verdict, stopKey, ran: structuredClone(ran.subflows ?? []) };
    return { step: this.step(ran), verdict: answer.verdict };
  }

  /** The step the repair of `latest` is checked on (header); undefined where none is named. */
  step(latest: Latest): AutomationStudioSubflowRepairStep | undefined {
    const failed = this.failed;
    if (!failed) return undefined;
    const nodes = ordered(latest.subflows ?? []);
    const stopped = failed.stopKey === undefined ? undefined : nodes.find((node) => node.key === failed.stopKey);
    if (stopped) return said(stopped);
    const changed = firstChanged(failed.ran, latest.subflows ?? []);
    return changed ? said(changed) : undefined;
  }

  /**
   * Whether a whole test of `latest` is refused while the repair stands
   * (header): undefined where it is allowed -- no repair stands, its step is
   * the part's first, or the builder said why a run from the step cannot
   * check it -- else the step to run from, where one is named.
   */
  refuses(latest: Latest, fromStepImpossible: string | undefined): { step?: AutomationStudioSubflowRepairStep | undefined } | undefined {
    if (!this.failed) return undefined;
    const step = this.step(latest);
    if (step && step.key === latest.subflows?.[0]?.nodes?.[0]?.key) return undefined;
    if (fromStepImpossible !== undefined && fromStepImpossible.trim()) return undefined;
    return { step };
  }

  /** A from-step run of `latest` from `from` did `result` (header): clears the repair where it checked it. */
  afterFromStep(result: Pick<AutomationStudioSubflowFromStepResult, "status" | "passedKeys">, latest: Latest, from: string): AutomationStudioSubflowRepairChecked {
    const failed = this.failed;
    if (!failed) return { standing: false };
    const step = this.step(latest);
    if (failed.verdict === "no" && failed.digest === latest.digest) return { standing: true, cleared: false, step, why: "unchanged" };
    if (step) {
      const keys = ordered(latest.subflows ?? []).map((node) => node.key);
      if (keys.indexOf(from) > keys.indexOf(step.key)) return { standing: true, cleared: false, step, why: "started_after" };
      if (!result.passedKeys.includes(step.key)) return { standing: true, cleared: false, step, why: "not_passed" };
    } else if (result.status !== "ended") {
      return { standing: true, cleared: false, why: "not_passed" };
    }
    this.failed = undefined;
    return { standing: true, cleared: true, step };
  }
}

/** Every step of `subflows`, the target's first, each key once, in plan order. */
function ordered(subflows: readonly AutomationStudioFlowBootstrapSubflow[]): AutomationStudioFlowBootstrapNode[] {
  const seen = new Set<string>();
  return subflows.flatMap((subflow) => subflow.nodes ?? []).filter((node) => {
    if (seen.has(node.key)) return false;
    seen.add(node.key);
    return true;
  });
}

/** The first step of `latest`, in plan order, whose node is not as it was in `ran` (header). */
function firstChanged(ran: readonly AutomationStudioFlowBootstrapSubflow[], latest: readonly AutomationStudioFlowBootstrapSubflow[]): AutomationStudioFlowBootstrapNode | undefined {
  for (const subflow of latest) {
    const before = ran.find((earlier) => earlier.key === subflow.key);
    for (const node of subflow.nodes ?? []) {
      const was = before?.nodes?.find((earlier) => earlier.key === node.key);
      if (!was || canonical(was) !== canonical(node)) return node;
    }
  }
  return undefined;
}

function said(node: AutomationStudioFlowBootstrapNode): AutomationStudioSubflowRepairStep {
  return { key: node.key, ...(typeof node.label === "string" && node.label ? { label: node.label } : {}) };
}

/** A value as text with every object's keys sorted, so two equal nodes read the same whatever order their keys were written in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => (entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : entry));
}
