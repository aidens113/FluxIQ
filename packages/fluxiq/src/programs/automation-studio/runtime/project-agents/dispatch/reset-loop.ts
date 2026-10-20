import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
// From its own module, as the subflow builder imports it: through the `llm` barrel it arrived undefined under the test loader (a module cycle).
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_RESET_COMPLETION } from "./reset-completion.ts";
import type { AutomationStudioProjectResetPorts } from "./types.ts";

// A reset brief's run (automation-project-agents-plan, `reset` brief kind;
// user rule, 2026-10-12): the same evidence loop a builder runs, with the
// tools the caller gives it to reverse this build's own lasting acts through
// the site's controls, and no proposal. It may complete only once nothing of
// this build is left to undo; until then each completion is refused with the
// acts still in place, so the model is told exactly what is left.
//
// The acts are its task from the first decision, not only once a completion
// is refused (t585, social debug root cause 2): the caller's ports put them in
// the loop's own instruction, with how each was done and on which page
// (`service/project-build/brief-ports.ts`). A refusal names what each act
// changed that is still there, when the reset went back and looked, and, for
// an act still open, what settles it (`settle`, L1 reset settlement): what to
// read again or undo, in its ledger's words.
//
// **`cannotUndo` reports an act; it settles only what the site truly cannot
// undo** (t591, social debug fix 2; L1). Some lasting acts have no control
// that reverses them: an answered request shows only its answer. A completion
// may name such acts under `cannotUndo`; `remainingActs` hands them to the
// ledger before it looks again (`site-reset/ledger.ts`, `beforeTrial`), which
// keeps a legacy act once the reset has asked for it: no longer to undo,
// trials run with it in place and the judge is told under
// `startedWith.cannotUndo`, so the reset can come back `done`. A reversible
// act whose watched state still differs is never settled by being named: it
// stays listed with what settles it. A completion that names every act still
// listed under `cannotUndo`, each after a refusal listed it with what settles
// it, is the reset's honest unresolved ending: the loop accepts it, and the
// reset comes back `blocked` with those acts still to undo, so no further
// trial runs on them (`./ending.ts`).
//
// **Only an act named or refused is kept** (F1 continuation; user, 2026-10-12).
// No act is kept for having been asked for several times, and no trial is
// admitted on leftovers: an act the reset neither undid, settled against its
// named destination, nor named under `cannotUndo` (and whose undo was not
// refused) is still to undo, so the reset ends `blocked` with it listed and
// every trial is refused until a later reset deals with it.

/** The code a reset's completion is refused under while acts are still in place. */
const RESET_INCOMPLETE = "project.reset_acts_in_place";
/** What that refusal tells the model (header): generic, naming no site. */
const RESET_INCOMPLETE_WORDS = [
  "Some lasting acts this build made are still on the site.",
  "Each listed act says under settle what settles it: read what it names, or undo the act through the site's own controls on the page your task names for it, naming it under undoes, and leave everything that was there before the build began.",
  "Complete once none is left.",
  "cannotUndo reports to the judge an act the site truly cannot undo, but it never settles a reversible act whose watched state still differs: such an act stays listed with what settles it.",
  "If the site offers no control on an act's own item that reverses it, do not keep trying: complete with an honest unresolved summary naming every such act under cannotUndo; the reset then ends unresolved and the build ends without a further trial."
].join(" ");

export async function runAutomationStudioProjectResetLoop(input: {
  brief: AutomationStudioProjectSubflowBrief;
  ports: AutomationStudioProjectResetPorts;
  /** What is still to undo once the acts named under `cannotUndo` are kept where the ledger allows it (header). */
  remainingActs: (cannotUndo?: readonly string[]) => Promise<readonly AutomationStudioSiteResetNamedAct[]>;
  allowance: AutomationStudioLlmBuildPurse;
  signal: AbortSignal;
  callScope: string | undefined;
}): Promise<AutomationStudioLlmEvidenceLoopResult> {
  /** The acts a refusal has listed, with what settles them, so far (header). */
  const refused = new Set<string>();
  return await runAutomationStudioLlmEvidenceLoop({
    ...input.ports.loop,
    draft: false,
    dryRun: false,
    maxIterations: input.brief.maxIterations,
    signal: input.signal,
    purse: input.allowance,
    ...(input.callScope !== undefined ? { callScope: input.callScope } : {}),
    // The one schema the reset ports also send as the request's (`./reset-completion.ts`, F3).
    completionSchema: AUTOMATION_STUDIO_PROJECT_RESET_COMPLETION,
    checkCompletion: async (result) => {
      const named = namedActs(result.cannotUndo);
      const left = await input.remainingActs(named);
      if (!left.length) return { ok: true };
      // The honest unresolved ending (header): every act still listed named under cannotUndo, each after a refusal listed it.
      if (named && left.every((act) => named.includes(act.act) && refused.has(act.act))) return { ok: true };
      for (const act of left) refused.add(act.act);
      return {
        ok: false,
        issueCodes: [RESET_INCOMPLETE],
        feedback: {
          code: RESET_INCOMPLETE,
          actsToUndo: left.map((act) => ({ act: act.act, did: act.did, ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.settle ? { settle: act.settle } : {}) })),
          instruction: RESET_INCOMPLETE_WORDS
        }
      };
    }
  });
}

/** The act ids a completion named under `cannotUndo`; anything else is ignored. */
function namedActs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}
