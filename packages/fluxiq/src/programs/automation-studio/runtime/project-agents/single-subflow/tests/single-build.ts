// A build whose dispatch tests through the plan's whole test, for the
// single-subflow tests: the supervisor fixture's build (`../../supervisor/tests/supervisor-fixture.ts`,
// a lending library's catalogue no realistic Lab scenario uses) with its stub
// dispatcher replaced by one whose builders submit their subflow through the
// real scoped submission controller and then test it as a builder's gate would
// ask its port: through the dispatch's `wholeTrial` when it has one, under the
// brief's own purse scope and attribution -- one allowance carved as the brief
// starts and closed as it ends, as `../../dispatch/run-brief.ts` does. A reset
// brief is the fixture's.
import type { JsonObject } from "../../../../../../core/index.ts";
import { refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import { AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal, type AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { withAutomationStudioProjectAgent } from "../../attribution/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectDispatchRequest, AutomationStudioProjectDispatchWholeTrialAnswer } from "../../dispatch/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "../../supervisor/index.ts";
import { BUILD, project } from "../../supervisor/tests/supervisor-fixture.ts";

/** The script a builder of the one subflow writes on its `attempt`th test, by default. */
export function script(subflowKey: string, label = "open the catalogue"): string[] {
  return [`flow: ${subflowKey.replace(/_/gu, " ")}`, `step: ${label}`, "  node: web.browser.navigate", "  url: https://library.test/catalogue"];
}

/** What one builder does before each test: e.g. leave a lasting act on the site. */
type BeforeTest = (brief: AutomationStudioProjectSubflowBrief, ledger: ReturnType<typeof project>["ledger"]) => void | Promise<void>;

export function singleBuild(options: Parameters<typeof project>[0] & {
  /** The scripts a builder submits and tests in turn, until one answers yes or they run out; one default script when absent. */
  scripts?: (brief: AutomationStudioProjectSubflowBrief) => string[][];
  /** How many times each submitted script is tested before the next, while none answers yes or no; once when absent. */
  testsPerScript?: number;
  beforeTest?: BeforeTest;
} = {}) {
  const built = project(options);
  const fixtureDispatch = built.ports.dispatch;
  /** Every whole-test answer a builder was given, and the purse and agent each test's judge ran under. */
  const answers: AutomationStudioProjectDispatchWholeTrialAnswer[] = [];
  const wholeTrialOffered: boolean[] = [];
  const submission = refusalTestSubmission();
  const dispatch: AutomationStudioProjectSupervisorPorts["dispatch"] = async (request: AutomationStudioProjectDispatchRequest) => {
    wholeTrialOffered.push(request.wholeTrial !== undefined);
    const returns: AutomationStudioProjectBuilderReturn[] = [];
    for (const brief of request.briefs) {
      if (brief.kind === "reset") {
        returns.push(...(await fixtureDispatch({ briefs: [brief], signal: request.signal })).returns);
        continue;
      }
      built.dispatched.push({ briefs: [structuredClone(brief)], signal: request.signal });
      returns.push(await asBuilder(brief, () => builder(brief, request)));
    }
    return { returns };
  };
  async function builder(brief: AutomationStudioProjectSubflowBrief, request: AutomationStudioProjectDispatchRequest): Promise<AutomationStudioProjectBuilderReturn> {
    const scope = await scopeOf(brief);
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [], submission });
    const trials: AutomationStudioProjectBuilderReturn["trials"] = [];
    let last: AutomationStudioSubflowProposal | undefined;
    for (const lines of options.scripts?.(brief) ?? [script(brief.subflowKey)]) {
      const submitted = await controller.submit({ flow: lines.join("\n") });
      if (!submitted.ok) throw new Error(`fixture script refused: ${JSON.stringify(submitted.check.feedback)}`);
      last = submitted.proposal;
      if (!request.wholeTrial) return { briefId: brief.briefId, outcome: "done", reason: "Untried.", proposal: { subflowKey: brief.subflowKey, revision: last.revision, digest: last.digest }, trials: [], spentUsd: 0, calls: 1 };
      for (let tested = 0; tested < (options.testsPerScript ?? 1); tested += 1) {
        await options.beforeTest?.(brief, built.ledger);
        const answer = await request.wholeTrial({ scope: structuredClone(scope), proposal: structuredClone(last!), signal: request.signal });
        answers.push(answer);
        if (!("trial" in answer)) continue;
        trials.push({ kind: "subflow_trial", receiptId: answer.trial.trialRunId ?? `${brief.briefId}.trial-${trials.length + 1}`, digest: "c".repeat(64), verdict: answer.trial.verdict });
        if (answer.trial.verdict === "yes") return { briefId: brief.briefId, outcome: "done", reason: "Its trial answered yes.", proposal: { subflowKey: brief.subflowKey, revision: last.revision, digest: last.digest }, trials, spentUsd: 0.02, calls: 6 };
        if (answer.trial.verdict === "no") break;
      }
    }
    return { briefId: brief.briefId, outcome: "partial", reason: "No test of the subflow answered yes.", ...(last ? { proposal: { subflowKey: brief.subflowKey, revision: last.revision, digest: last.digest } } : {}), trials, spentUsd: 0.02, calls: 6 };
  }
  /** Runs `work` as the brief's builder does: its attribution and, given a purse, inside the one allowance carved for it. */
  async function asBuilder<T>(brief: AutomationStudioProjectSubflowBrief, work: () => Promise<T>): Promise<T> {
    const purse: AutomationStudioLlmBuildPurse | undefined = options.purse;
    const carved = purse?.allowance({ role: "builder", briefId: brief.briefId, usd: Math.min(brief.allowanceUsd, purse.allocatableUsd()) });
    if (carved && !carved.ok) throw new Error("allowance refused");
    try {
      return await withAutomationStudioProjectAgent({ role: "builder", briefId: brief.briefId }, () => automationStudioLlmBuildPurseScope(carved?.allowance, work));
    } finally {
      carved?.allowance.close();
    }
  }
  async function scopeOf(brief: AutomationStudioProjectSubflowBrief): Promise<AutomationStudioSubflowScope> {
    const view = await built.record.read(BUILD);
    const plan = view!.record.plans.at(-1)!.plan;
    const spec = view!.record.taskSpecs.at(-1)!.taskSpec;
    const subflow = plan.plan.subflows.find((candidate) => candidate.key === brief.subflowKey)!;
    return {
      buildId: BUILD.buildId, briefId: brief.briefId, planDigest: brief.planDigest, subflowKey: brief.subflowKey,
      parts: brief.parts.map((id) => {
        const part = spec.parts.find((candidate) => candidate.id === id)!;
        return { partId: id, sourceId: part.quote.sourceId, text: part.quote.text };
      }),
      ...(subflow.interface ? { interface: subflow.interface } : {}),
      predecessors: brief.entry.predecessors
    };
  }
  built.ports.dispatch = dispatch;
  return { ...built, answers, wholeTrialOffered };
}

/** A refusal's detail, read off a whole-test answer. */
export function refusalOf(answer: AutomationStudioProjectDispatchWholeTrialAnswer | undefined): { code: string; instruction: string; detail: JsonObject; retry: boolean } | undefined {
  return answer && "refused" in answer ? answer.refused : undefined;
}
