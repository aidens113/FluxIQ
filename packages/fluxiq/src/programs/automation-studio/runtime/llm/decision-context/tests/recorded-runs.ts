// Three recorded live builds, replayed through the real evidence loop with no
// provider and no browser, so what each decision was *shown* can be read.
//
// The live record of a build is its `[FluxIQ build-trace]` lines: which kind of
// decision each iteration made, which calls ran with which result code, what a
// completion check refused, and which positions a dry run replayed. It carries
// no content -- no evidence, no argument, no amendment -- and the loop's own
// trace is deleted with the Lab's Core store. So the one question every debug
// of these runs answered "NO EVIDENCE" to, what was in front of the model when
// it made a given decision, cannot be read off the run. It can be rebuilt: the
// loop is deterministic given its callbacks, and the callbacks are what the log
// constrains.
//
// **What is taken from the log, and what is chosen.** Each run below is the log
// transcribed one decision per line (`LOG`), which the driver replays and then
// re-emits in the same format, so a test can hold the rebuilt run to the
// recorded one. Everything the log does not say is chosen, and every choice is
// written beside the data it shapes:
//
//   - A call's result is built from its logged result code: a `*.rejected.*`
//     code answers `{ok:false, code}` with the page, a `web.action.succeeded`
//     applied its effect and proposes a step, a look proposes nothing. A read
//     node (a list extraction) is a look that *does* propose a step -- the web
//     domain proposes every node but the snapshot
//     (`domain/src/runtime/llm-evidence/node-run/catalog.ts:94`) -- and the
//     dry runs prove it: run 4 replayed positions 26, 28, 29 and 30, all of
//     them `web.inspect.succeeded` reads. Which calls were reads is `READS`.
//   - A `tool_call` decision with no call after it was answered from memory. It
//     is scripted as the exact request of the latest look in the same attempt
//     epoch (`../../repeat-policy.ts:47-60`), and the driver reports the
//     iterations so a test can assert the loop answered `already_answered`.
//   - Amendment content is not logged. Where later records constrain it -- a
//     step a dry run did not replay was withdrawn, one it did was kept -- the
//     minimum consistent edit is scripted. Everywhere else the amendment is a
//     settings-only edit of one kept step (`unlogged`): applied, refusing
//     nothing and changing no step, so it adds no evidence entry of its own.
//   - A completion check answers with the logged issue codes, in the shape of
//     `refused()` in `../../harness-options/bootstrap-completion.ts:389-432`.
//     Run 4 logged none; its refusals carry a named placeholder code.
//   - Pages are 5,800 bytes by default (the web domain caps a packet at 6,000);
//     a detection result 2,000. Both are options.
//
// The loop's limits are the service's for a 48-call grant
// (`../../../service.ts:1585-1631`), with `unusableDecisions`,
// `propagateDecisionErrors: true` and a fixed clock.

// The llm barrel first: `runtime/loop-limits/` imports back into it, and reached
// the other way round the suite does not collect (see
// `../../tests/evidence-loop-draft-shown.test.ts`).
import {
  automationStudioLlmRunNodeTool,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioFlowDraftAmendment,
  type AutomationStudioLlmEvidenceCompletionCheck,
  type AutomationStudioLlmEvidenceLoopResult,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../index.ts";
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../../../loop-limits/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";

export type RecordedRunName = "bigbox-run6" | "crossborder" | "everything-store-run4";

export type RecordedRunOptions = {
  /** Bytes of one web page packet: an inspect, an action, a refusal. */
  pageBytes?: number;
  /** Bytes of one repeating-structure detection. */
  detectBytes?: number;
  /**
   * Let the loop go on past the last logged decision instead of stopping it
   * there. The next decision is where the run is cancelled, which ends it
   * `cancelled` -- if the loop gets as far as asking.
   */
  pastLog?: boolean;
};

export type RecordedEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

export type RecordedCoreEntry = {
  callId: string;
  toolId: string;
  /** The decision this entry was first there for: created after the one before it. */
  before: number;
};

export type RecordedRunReplay = {
  name: RecordedRunName;
  /** What each decision was shown, exactly as the loop handed it to `decide`. */
  shown: { iteration: number; evidence: RecordedEvidenceEntry[] }[];
  trace: AutomationStudioLlmEvidenceLoopTrace[];
  result: AutomationStudioLlmEvidenceLoopResult;
  /** The replay re-emitted in the log's own format, one decision per line. */
  rebuilt: string[];
  /** The log's transcription, in the same format. */
  logged: string[];
  /**
   * What the current code is expected to rebuild: `logged`, with each line the
   * run's `now` names replaced. The replay is held to this, line for line.
   */
  expected: string[];
  /** The iterations whose expected line is not the logged one, and why. */
  diverges: Readonly<Record<number, string>>;
  /** Iterations scripted as a request answered from memory. */
  answered: number[];
  /**
   * Every Core entry the loop is known to have added, and the first decision it
   * could have been shown to. Known two ways: seen in some window, or implied
   * by the trace (a refused check, an answered request, a refused amendment).
   * Core entries carry no call summary, so a window that drops one lists it in
   * no history line either.
   */
  coreEntries: RecordedCoreEntry[];
};

const START = "https://store.test/start";
const SNAPSHOT = { node: "web.page.snapshot", parameters: {}, consequences: [] } satisfies JsonObject;
const DETECT_TOOL_ID = "web.detect_repeating_structure";
const RUN_NODE_TOOL_ID = "core.run_node";
/** Run 4 logged no completion check, so what its checks refused is not known. */
const UNLOGGED_CHECK_CODE = "recorded.unlogged_completion_refusal";
/** Why a logged completion that the check refused no longer runs its dry run. */
const A_RERUN_RUNS_FROM_ITS_PLACE = "a rerun runs from the page its step started on, put back first when the page has moved since (lane C, t194 runs 11 and 12)";
const NOT_TESTED_WHILE_THE_CHECK_REFUSES = "a completion the check refuses is still live work and is not tested; the draft is replayed only once the check accepts it";

/** A settings-only edit of one kept step: the stand-in for an amendment whose content was not logged. */
const unlogged = (step: number, iteration: number, as: "keep" | "exploratory" = "keep"): AutomationStudioFlowDraftAmendment[] =>
  [{ step, change: as, settings: { unloggedAmendment: iteration } }];

type CheckScript = "ok" | { codes: string[]; feedback: JsonObject };

type RecordedRun = {
  log: string;
  /** Calls to `core.run_node` that ran a read node (effect observe, proposes a step). */
  reads: ReadonlySet<string>;
  /** Amendments by iteration, for every `amend_draft` line. */
  amendments: Readonly<Record<number, AutomationStudioFlowDraftAmendment[]>>;
  /** The completion check's answer by iteration, for every `complete` line. */
  checks: Readonly<Record<number, CheckScript>>;
  /** Whether this run's build logged its completion checks. */
  logsChecks: boolean;
  /**
   * Decisions the current code answers differently from the build that was
   * logged, each as the line it now traces and why. The rest of the log is
   * still what the replay must rebuild exactly; a line here is a known,
   * deliberate change of Core's, never a gap in the replay.
   */
  now?: Readonly<Record<number, { line: string; why: string }>>;
};

// ---------------------------------------------------------------------------
// The completion-check refusals, shaped as `refused()` writes them.
// ---------------------------------------------------------------------------

// The instructions are Core's own sentences at this commit, copied because none
// is exported; their length is what matters to a window.
const FEEDBACK_INSTRUCTION = "The completed plan was refused and nothing was created. Correct every listed issue and complete again. "
  + "Where an issue carries accepted, it is what that parameter takes: write only the keys it names, beside a handle where one belongs, and follow its example. "
  + "Where a parameter needs something you observed, write {\"handle\": \"<handle copied exactly from evidence>\"} instead of writing a locator of your own; "
  + "if you explored more than one place, add \"location\": \"<the location the evidence reported for that handle>\". "
  + "A code written <code>:<path> names where inside that node's parameters the issue is, with keys you chose given by their position; "
  + "a parameter's own description names any further keys it takes beside the handle. "
  + "Correct each refused step; never delete one the instruction needs, and never replace it with a step that answers something else. "
  + "A handle is refused when it is not one the evidence printed: reread the evidence and copy that token exactly, rather than writing one that looks like it. "
  + "Where previous is given, it is the script you just sent. Send it again with only the listed issues corrected: keep every other line exactly as it is, rather than writing the result again from memory.";
const SEVERAL_INSTRUCTION = "Every check was run and refusals lists each one that failed: correct all of them before completing again, not only the first.";
const LIMITS_INSTRUCTION = "limitsExceeded names each limit the result is over, its max and the actual value: shorten the summary, or drop or split what that limit counts.";
const CANNOT_REACH_INSTRUCTION = "Nothing was created and this build is still open, so correct it rather than finishing again unchanged. "
  + "cannotReach.starts is where this Flow has to begin, and cannotReach.steps are the steps you have -- none of them goes there. "
  + "Run the node from your node library that goes to cannotReach.starts, keep it in the draft as the first step, and finish again. "
  + "It is the same step you had to run before anything else would run for you, and the Flow meets that rule again the first time it runs on its own: "
  + "a Flow that begins by acting on a target no step of it opened cannot take a single step.";
const MISSING_ACTS_INSTRUCTION = "Nothing was created and this build is still open. "
  + "missingActs.acts are things the person's instruction asks to be done -- each quote is their own words -- that no kept step of your draft is named as doing, and reason says why. "
  + "For each one: if a kept step already does it, name that step's id in acts; if none does, run the node that does it (press the control, set the option, open the page), keep it, and name it. "
  + "Then complete again with acts listing every act and its step. Each act needs a step of its own, and it must be one that changed something.";

type Failure = { code: string; issues: { code: string; path: string; message: string }[]; detail?: { key: string; value: JsonValue; instruction: string } };

function refusal(failures: Failure[]): CheckScript {
  const codes = [...new Set(failures.map((failure) => failure.code))];
  const instructions = [...new Set([...(failures.length > 1 ? [SEVERAL_INSTRUCTION] : []), ...failures.map((failure) => failure.detail?.instruction ?? FEEDBACK_INSTRUCTION)])];
  return {
    codes: [...new Set(failures.flatMap((failure) => failure.issues.map((item) => item.code)))],
    feedback: {
      ok: false,
      code: "flow_bootstrap.completion_refused",
      refusal: codes[0]!,
      ...(codes.length > 1 ? { refusals: codes } : {}),
      issues: failures.flatMap((failure) => failure.issues.map((item) => ({ ...item }))),
      ...Object.fromEntries(failures.flatMap((failure) => failure.detail ? [[failure.detail.key, failure.detail.value]] : [])),
      instruction: instructions.join(" ")
    }
  };
}

// The quote the instructed-act check carries, 200 characters as run 6's debug
// measured it; the words are a stand-in of that length.
const QUOTE = "Switch my store to Millbrook, then add one pack of the store-brand paper towels and one pack of the store-brand napkins to the cart, keeping the quantities at one each and the store set to Millbrook.".slice(0, 200);

const limitsExceeded = (actual: number): Failure => ({
  code: "flow_bootstrap.evidence_completion_profile_limit_exceeded",
  // Which limit is by elimination in run 6's debug: the summary, over 240.
  // The actual length is a choice.
  issues: [{ code: "bootstrap.completion_profile_limit_exceeded", path: "summary", message: "The completed result is over one of its limits; limitsExceeded names which." }],
  detail: { key: "limitsExceeded", value: [{ path: "summary", max: 240, actual }], instruction: LIMITS_INSTRUCTION }
});
const cannotReach = (steps: string[]): Failure => ({
  code: "flow_bootstrap.evidence_completion_cannot_reach_start",
  issues: [{ code: "bootstrap.cannot_reach_start_location", path: "plan.subflows", message: "This Flow acts on the target it was told to start at and no step of it goes there, so no run of it could take its first step." }],
  detail: { key: "cannotReach", value: { starts: START, lacks: "no step of this Flow goes to where it starts", steps }, instruction: CANNOT_REACH_INSTRUCTION }
});
const actsMissing = (acts: { id: string; kind: string; verb: string }[], stepsThatChangedSomething: string[]): Failure => ({
  code: "flow_bootstrap.evidence_completion_cannot_answer",
  issues: [{ code: "bootstrap.instructed_act_missing", path: "acts", message: "The instruction asks for something to be done that no kept step of this draft is named as doing." }],
  detail: { key: "missingActs", value: { acts: acts.map((act) => ({ ...act, quote: QUOTE, reason: "no_step_named" })), stepsThatChangedSomething }, instruction: MISSING_ACTS_INSTRUCTION }
});
const planInvalid = (code: string, path: string): Failure => ({
  code: "flow_bootstrap.evidence_completion_plan_invalid",
  issues: [{ code, path, message: "The completed result was refused." }]
});

// ---------------------------------------------------------------------------
// The runs. `LOG` lines: `D<n> <kind>`, then ` | ` and each event the build
// traced after that decision -- `<callId> [<toolId> ]<resultCode>` (the tool is
// written only when it is not `core.run_node`), or the completion check.
// Transcribed mechanically from each run's `logs/core.log`.
// ---------------------------------------------------------------------------

/** Run 6, bigbox: `t174-slot-1/run-muncqlr0-3348202b`. */
const BIGBOX_RUN6: RecordedRun = {
  log: `
D0 initial | initial.core.run_node web.inspect.succeeded
D1 tool_call | dismiss-privacy web.action.rejected.target_unobserved
D2 tool_call | snap2 web.inspect.succeeded
D3 tool_call | dismiss-privacy-2 web.action.succeeded
D4 tool_call | open-store-picker web.action.rejected.target_unobserved
D5 tool_call | snap3 web.inspect.succeeded
D6 tool_call
D7 tool_call
D8 tool_call
D9 tool_call
D10 tool_call | open-store-picker-2 web.action.succeeded
D11 amend_draft
D12 tool_call | pick-millbrook web.action.succeeded
D13 tool_call | snap-store-list web.inspect.succeeded
D14 tool_call
D15 tool_call
D16 tool_call
D17 tool_call
D18 tool_call
D19 tool_call
D20 tool_call
D21 amend_draft
D22 complete | check ok=false issues=bootstrap.completion_profile_limit_exceeded,bootstrap.cannot_reach_start_location | dryrun.1.reset core.replay.replayed | dryrun.1.4 core.replay.unreproducible | dryrun.1.11 core.replay.unreproducible
D23 amend_draft
D24 tool_call | nav-start web.action.succeeded
D25 tool_call | open-store-picker-3 web.action.succeeded
D26 complete | check ok=false issues=bootstrap.instructed_act_missing | dryrun.2.reset core.replay.replayed | dryrun.2.21 core.replay.replayed | dryrun.2.22 core.replay.replayed
D27 amend_draft
D28 amend_draft
D29 amend_draft
D30 amend_draft
D31 tool_call | open-store-picker-4 web.action.succeeded
D32 amend_draft
D33 tool_call | pick-millbrook-2 web.action.succeeded
D34 tool_call | open-store-picker-5 web.action.succeeded
D35 amend_draft
D36 tool_call | open-store-picker-6 web.action.succeeded
D37 tool_call | pick-millbrook-3 web.action.succeeded
`,
  reads: new Set(),
  amendments: {
    // Not constrained: neither dry run says anything that 11 could have changed.
    11: unlogged(11, 11),
    // Dry run 1 replayed 4 and 11 and not 12, so 12 (`pick-millbrook`) was out
    // by then; the debug leaves open whether `effectApplied` or this amendment
    // took it out, and the brief settles it as this amendment.
    21: [{ step: 12, change: "drop" }],
    // Dry run 2 replayed 21 and 22 only, so 4 and 11 were out.
    23: [{ step: 4, change: "drop" }, { step: 11, change: "drop" }],
    // After dry run 2 nothing constrains the draft.
    27: unlogged(22, 27), 28: unlogged(22, 28), 29: unlogged(22, 29), 30: unlogged(22, 30),
    32: unlogged(22, 32), 35: unlogged(22, 35)
  },
  checks: {
    // The actual summary length is a choice (the debug proves only "over 240").
    // `cannotReach.steps` lists the plan's two steps, as the check writes them.
    22: refusal([limitsExceeded(312), cannotReach(["d4", "d11"])]),
    // Which act was named is not traced; `a2` (add) is the one no step could
    // have done, and the kept mutating steps are 21 and 22.
    26: refusal([actsMissing([{ id: "a2", kind: "add_to", verb: "add" }], ["d21", "d22"])])
  },
  logsChecks: true,
  now: {
    // Both completions were refused by the check, and since 2026-09-30 a
    // completion the check refuses is not tested: it is still the live phase,
    // and the draft is replayed from its first step only once the check accepts
    // it (`../../evidence-loop/completion-attempt.ts`). So neither dry run runs.
    22: {
      line: "D22 complete | check ok=false issues=bootstrap.completion_profile_limit_exceeded,bootstrap.cannot_reach_start_location",
      why: NOT_TESTED_WHILE_THE_CHECK_REFUSES
    },
    26: {
      line: "D26 complete | check ok=false issues=bootstrap.instructed_act_missing",
      why: NOT_TESTED_WHILE_THE_CHECK_REFUSES
    }
  }
};

/** Crossborder marketplace: `t174-slot-1/run-munda7ub-d9214e3b`. */
const CROSSBORDER: RecordedRun = {
  log: `
D0 initial | initial.core.run_node web.inspect.succeeded
D1 tool_call | nav1 web.action.succeeded
D2 tool_call | detect1 web.detect_repeating_structure web.structure.detected
D3 tool_call
D4 tool_call | nav2 web.action.succeeded
D5 tool_call | nav3 web.action.succeeded
D6 tool_call | nav4 web.action.succeeded
D7 tool_call | nav5 web.action.succeeded
D8 amend_draft
D9 tool_call | extract1 web.inspect.succeeded
D10 amend_draft
D11 amend_draft
D12 complete | check ok=false issues=bootstrap.invalid_subflows
D13 complete | check ok=false issues=bootstrap.invalid_subflows
D14 tool_call | nav6 web.action.succeeded
D15 amend_draft
D16 amend_draft
D17 amend_draft
D18 amend_draft
D19 complete | check ok=false issues=bootstrap.instructed_act_missing | dryrun.1.reset core.replay.replayed | dryrun.1.9 core.replay.replayed | dryrun.1.10 core.replay.replayed
D20 tool_call | nav7 web.action.succeeded
D21 amend_draft
D22 tool_call | act1 web.action.rejected.target_not_found
`,
  // Dry run 1 replayed position 9, which only a read can be.
  reads: new Set(["extract1"]),
  amendments: {
    // Completions 12 and 13 ran no dry run, and a draft with a proposed step
    // that says how to replay it always runs one (`../../node-tools/dry-run-gate.ts`),
    // so at 12 nothing was proposed: every navigation (2, 5-8) and the read (9)
    // was withdrawn -- which is also what `bootstrap.invalid_subflows` says.
    8: [2, 5, 6, 7, 8].map((step) => ({ step, change: "exploratory" as const })),
    10: [{ step: 9, change: "exploratory" }],
    11: unlogged(9, 11, "exploratory"),
    // Dry run 1 at 19 replayed 9 and 10, so 9 was put back.
    15: [{ step: 9, change: "keep" }],
    16: unlogged(10, 16), 17: unlogged(10, 17), 18: unlogged(10, 18),
    21: unlogged(11, 21)
  },
  checks: {
    12: refusal([planInvalid("bootstrap.invalid_subflows", "plan.subflows")]),
    13: refusal([planInvalid("bootstrap.invalid_subflows", "plan.subflows")]),
    // Which act is not traced; the kept mutating step at 19 is 10 (`nav6`).
    19: refusal([actsMissing([{ id: "a1", kind: "submit", verb: "buy" }], ["d10"])])
  },
  logsChecks: true,
  now: {
    // Refused by the check, so not tested (see bigbox-run6's 22 and 26).
    19: { line: "D19 complete | check ok=false issues=bootstrap.instructed_act_missing", why: NOT_TESTED_WHILE_THE_CHECK_REFUSES }
  }
};

/** Run 4, everything-store: `t174-slot-2/run-munaiz76-7026748c`. */
const EVERYTHING_STORE_RUN4: RecordedRun = {
  log: `
D0 initial | initial.core.run_node web.action.rejected.not_at_start_location
D1 tool_call | nav1 web.action.succeeded
D2 tool_call | dismiss1 web.action.succeeded
D3 tool_call | search1 web.action.succeeded
D4 tool_call | submit1 web.action.succeeded
D5 tool_call | continue1 web.action.succeeded
D6 tool_call | detect1 web.detect_repeating_structure web.structure.detected
D7 tool_call | detect2 web.detect_repeating_structure web.structure.detected
D8 tool_call
D9 tool_call | snap1 web.inspect.succeeded
D10 tool_call | extract1 web.inspect.succeeded
D11 tool_call | extract2 web.inspect.succeeded
D12 tool_call
D13 tool_call | cart1 web.action.succeeded
D14 tool_call | cartextract1 web.inspect.succeeded
D15 amend_draft
D16 tool_call | cartdetect1 web.detect_repeating_structure web.structure.detected
D17 tool_call | cartextract2 web.inspect.succeeded
D18 tool_call | search2 web.action.succeeded
D19 tool_call | detect3 web.detect_repeating_structure web.structure.detected
D20 amend_draft
D21 amend_draft
D22 amend_draft
D23 amend_draft
D24 tool_call | cartview1 web.action.succeeded
D25 tool_call | cartview2 web.inspect.succeeded
D26 amend_draft
D27 tool_call | cartdetect2 web.detect_repeating_structure web.structure.detected
D28 amend_draft
D29 complete | dryrun.1.reset core.replay.replayed | dryrun.1.2 core.replay.replayed | dryrun.1.3 core.replay.unreproducible | dryrun.1.4 core.replay.replayed | dryrun.1.5 core.replay.replayed | dryrun.1.6 core.replay.unreproducible | dryrun.1.14 core.replay.replayed | dryrun.1.18 core.replay.replayed | dryrun.1.20 core.replay.replayed
D30 tool_call | cartextract3 web.inspect.succeeded
D31 amend_draft
D32 amend_draft | rerun.23 web.inspect.succeeded
D33 amend_draft
D34 tool_call | addkettle1 web.action.succeeded
D35 amend_draft
D36 amend_draft
D37 amend_draft
D38 amend_draft | rerun.24 web.inspect.succeeded
D39 amend_draft
D40 complete | dryrun.2.reset core.replay.replayed | dryrun.2.2 core.replay.replayed | dryrun.2.3 core.replay.unreproducible | dryrun.2.4 core.replay.replayed | dryrun.2.5 core.replay.replayed | dryrun.2.6 core.replay.unreproducible | dryrun.2.14 core.replay.replayed | dryrun.2.18 core.replay.replayed | dryrun.2.20 core.replay.replayed | dryrun.2.25 core.replay.replayed | dryrun.2.26 core.replay.replayed
D41 tool_call | saveforlater1 web.action.succeeded
D42 amend_draft | rerun.26 web.inspect.succeeded
D43 tool_call | cartextract4 web.inspect.succeeded
D44 complete | dryrun.3.reset core.replay.replayed | dryrun.3.2 core.replay.replayed | dryrun.3.3 core.replay.unreproducible | dryrun.3.4 core.replay.replayed | dryrun.3.5 core.replay.replayed | dryrun.3.6 core.replay.unreproducible | dryrun.3.14 core.replay.replayed | dryrun.3.18 core.replay.replayed | dryrun.3.20 core.replay.replayed | dryrun.3.25 core.replay.replayed | dryrun.3.27 core.replay.replayed | dryrun.3.28 core.replay.replayed | dryrun.3.29 core.replay.replayed
D45 tool_call | cartextract5 web.inspect.succeeded
D46 complete | dryrun.4.reset core.replay.replayed | dryrun.4.2 core.replay.replayed | dryrun.4.3 core.replay.unreproducible | dryrun.4.4 core.replay.replayed | dryrun.4.5 core.replay.replayed | dryrun.4.6 core.replay.unreproducible | dryrun.4.14 core.replay.replayed | dryrun.4.18 core.replay.replayed | dryrun.4.20 core.replay.replayed | dryrun.4.25 core.replay.replayed | dryrun.4.27 core.replay.replayed | dryrun.4.28 core.replay.replayed | dryrun.4.29 core.replay.replayed | dryrun.4.30 core.replay.replayed
D47 complete
`,
  // The dry runs replayed 26, 28, 29 and 30 -- `rerun.24`, `rerun.26`,
  // `cartextract4`, `cartextract5` -- so those were reads. The other
  // extractions are read nodes by the same name and timing (2 to 11 s, where a
  // snapshot takes 58 to 128 ms); `snap1` and `cartview2` (79 ms) are snapshots.
  reads: new Set(["extract1", "extract2", "cartextract1", "cartextract2", "cartextract3", "rerun.23", "rerun.24", "rerun.26", "cartextract4", "cartextract5"]),
  amendments: {
    // Dry run 1 at 29 replayed 2-6, 14, 18 and 20: the reads before it (11, 12,
    // 15, 17) were withdrawn. When is a choice: the first amendment after each.
    15: [{ step: 11, change: "exploratory" }, { step: 12, change: "exploratory" }],
    20: [{ step: 15, change: "exploratory" }, { step: 17, change: "exploratory" }],
    // Until `cartview1` (20, decision 24) the newest kept step is `search2` (18).
    21: unlogged(18, 21), 22: unlogged(18, 22), 23: unlogged(18, 23), 26: unlogged(20, 26), 28: unlogged(20, 28),
    31: unlogged(20, 31),
    // The three reruns are logged by their call ids; each replaces the read the
    // one before produced. Their corrected arguments are a choice.
    32: [{ step: 23, change: "rerun", input: readInput("rerun.23") }],
    33: unlogged(20, 33), 35: unlogged(20, 35), 36: unlogged(20, 36), 37: unlogged(20, 37),
    38: [{ step: 24, change: "rerun", input: readInput("rerun.24") }],
    39: unlogged(20, 39),
    // The sixteenth amendment, the draft's allowance (`maxDraftAmendments`).
    42: [{ step: 26, change: "rerun", input: readInput("rerun.26") }]
  },
  checks: {
    // The debug reads completion 1 as refused by the dry run, and this script
    // used to let the check pass so that dry run would happen. It no longer can:
    // the dry run now makes steps 3 and 6 optional itself -- the prompt and the
    // soft check the store remembered, absent on the reset with every later step
    // replayed (`../../../flow-draft/sometimes-present.ts`) -- so a passing check
    // ends the build here, accepted. Today's check refuses it instead, as it
    // refuses 40-47: the kettle was added at 34 and saved for later at 41, so
    // at 29 the person's acts were not done.
    29: refusal([planInvalid(UNLOGGED_CHECK_CODE, "plan")]),
    40: refusal([planInvalid(UNLOGGED_CHECK_CODE, "plan")]),
    44: refusal([planInvalid(UNLOGGED_CHECK_CODE, "plan")]),
    46: refusal([planInvalid(UNLOGGED_CHECK_CODE, "plan")]),
    47: refusal([planInvalid(UNLOGGED_CHECK_CODE, "plan")])
  },
  logsChecks: false,
  now: {
    // The live build's checks refused 40, 44, 46 and 47 (it accepted nothing
    // here), and each of the first three ran a dry run; 47 reused dry run 4's
    // "clean" verdict, because the gate had waved steps 3 and 6 through from dry
    // run 2 on. Two changes since: an unreproducible step refuses every
    // completion unless the replay proves the Flow did not need it
    // (`../../../flow-draft/dry-run.ts`), and a completion the check refuses is
    // not tested at all (`../../evidence-loop/completion-attempt.ts`).
    // The second decides it: none of the five runs a dry run. 47 traces as
    // logged again.
    29: { line: "D29 complete", why: NOT_TESTED_WHILE_THE_CHECK_REFUSES },
    // Each rerun of the list read (32, 38, 42) now first puts the page back
    // where the read started, as a replay's reset does: the page had moved
    // since (`../../node-tools/step-place.ts`).
    32: { line: "D32 amend_draft | rerun.23.place core.replay.replayed | rerun.23 web.inspect.succeeded", why: A_RERUN_RUNS_FROM_ITS_PLACE },
    38: { line: "D38 amend_draft | rerun.24.place core.replay.replayed | rerun.24 web.inspect.succeeded", why: A_RERUN_RUNS_FROM_ITS_PLACE },
    40: { line: "D40 complete", why: NOT_TESTED_WHILE_THE_CHECK_REFUSES },
    42: { line: "D42 amend_draft | rerun.26.place core.replay.replayed | rerun.26 web.inspect.succeeded", why: A_RERUN_RUNS_FROM_ITS_PLACE },
    44: { line: "D44 complete", why: NOT_TESTED_WHILE_THE_CHECK_REFUSES },
    46: { line: "D46 complete", why: NOT_TESTED_WHILE_THE_CHECK_REFUSES }
  }
};

const RUNS: Readonly<Record<RecordedRunName, RecordedRun>> = {
  "bigbox-run6": BIGBOX_RUN6,
  crossborder: CROSSBORDER,
  "everything-store-run4": EVERYTHING_STORE_RUN4
};

// ---------------------------------------------------------------------------
// Reading the log.
// ---------------------------------------------------------------------------

type LoggedEvent =
  | { kind: "call"; callId: string; toolId: string; code: string }
  | { kind: "check"; text: string };
type LoggedDecision = { iteration: number; kind: "initial" | "tool_call" | "amend_draft" | "complete"; events: LoggedEvent[] };

function readLog(log: string): LoggedDecision[] {
  return log.trim().split("\n").map((line) => {
    const [head, ...rest] = line.split(" | ");
    const match = /^D(\d+) (\S+)$/.exec(head!.trim());
    if (!match) throw new Error(`recorded run: unreadable line ${line}`);
    const events = rest.map((text): LoggedEvent => {
      if (text.startsWith("check ")) return { kind: "check", text };
      const parts = text.split(" ");
      return parts.length === 3
        ? { kind: "call", callId: parts[0]!, toolId: parts[1]!, code: parts[2]! }
        : { kind: "call", callId: parts[0]!, toolId: RUN_NODE_TOOL_ID, code: parts[1]! };
    });
    return { iteration: Number(match[1]), kind: match[2] as LoggedDecision["kind"], events };
  });
}

function logLine(decision: LoggedDecision): string {
  const events = decision.events.map((event) => event.kind === "check" ? event.text
    : `${event.callId} ${event.toolId === RUN_NODE_TOOL_ID ? "" : `${event.toolId} `}${event.code}`);
  return [`D${decision.iteration} ${decision.kind}`, ...events].join(" | ");
}

// ---------------------------------------------------------------------------
// What each call answers.
// ---------------------------------------------------------------------------

function nodeFor(callId: string, kind: CallKind): string {
  if (kind === "snapshot") return SNAPSHOT.node;
  if (kind === "read") return "web.extract.list";
  if (/^nav/.test(callId)) return "web.navigate";
  if (/^search/.test(callId)) return "web.type";
  return "web.click";
}

type CallKind = "action" | "snapshot" | "read" | "detect";

function readInput(callId: string): JsonObject {
  return { node: "web.extract.list", parameters: { list: { handle: `list.${callId}` }, fields: ["name", "quantity", "price"] }, consequences: [] };
}

/** The request a model makes for a call the log names. */
function requestFor(callId: string, kind: CallKind): JsonObject {
  if (kind === "snapshot") return structuredClone(SNAPSHOT);
  if (kind === "read") return readInput(callId);
  if (kind === "detect") return { near: { handle: `region.${callId}` } };
  return { node: nodeFor(callId, kind), parameters: { target: { handle: `target.${callId}` } }, consequences: [] };
}

const FILLER = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ";
function padded(base: JsonObject, bytes: number): JsonObject {
  const room = bytes - Buffer.byteLength(JSON.stringify({ ...base, text: "" }), "utf8");
  return { ...base, text: FILLER.repeat(Math.ceil(Math.max(0, room) / FILLER.length) + 1).slice(0, Math.max(0, room)) };
}

// ---------------------------------------------------------------------------
// The driver.
// ---------------------------------------------------------------------------

/** Replays one recorded run through `runAutomationStudioLlmEvidenceLoop` and reports what each decision was shown. */
export async function replayRecordedRun(name: RecordedRunName, options: RecordedRunOptions = {}): Promise<RecordedRunReplay> {
  const run = RUNS[name];
  const pageBytes = options.pageBytes ?? 5_800;
  const detectBytes = options.detectBytes ?? 2_000;
  const logged = readLog(run.log);
  // The log, with each decision the current code is known to answer differently
  // replaced by what it now traces. The model's decisions are the log's either way.
  const now = new Map(Object.entries(run.now ?? {}).map(([iteration, change]) => {
    const [line] = readLog(change.line);
    if (!line || line.iteration !== Number(iteration)) throw new Error(`recorded run ${name}: the line expected at ${iteration} is for another decision`);
    if (!logged.some((decision) => decision.iteration === line.iteration && decision.kind === line.kind)) throw new Error(`recorded run ${name}: the log has no ${line.kind} at ${iteration} to replace`);
    return [line.iteration, line] as const;
  }));
  const expected = logged.map((decision) => now.get(decision.iteration) ?? decision);
  const byIteration = new Map(expected.map((decision) => [decision.iteration, decision] as const));
  // Every expected call's result code, by call id: the model's calls, the reruns, and each dry-run call.
  const codes = new Map(expected.flatMap((decision) => decision.events.flatMap((event) => event.kind === "call" ? [[event.callId, event.code] as const] : [])));
  const kindOf = (callId: string, toolId: string, code: string): CallKind =>
    toolId === DETECT_TOOL_ID ? "detect" : run.reads.has(callId) ? "read" : code.startsWith("web.inspect.") || callId === `initial.${RUN_NODE_TOOL_ID}` ? "snapshot" : "action";

  // The world, as far as a digest and a page packet need one: it moves when an action applies.
  let world = 0;
  // The loop's attempt epoch as this side can see it, and the latest look made in it.
  let attemptEpoch = 0;
  let latestLook: { toolId: string; input: JsonObject; epoch: number } | undefined;
  const rebuilt: LoggedDecision[] = [];
  const current = (): LoggedDecision => rebuilt[rebuilt.length - 1]!;
  const shown: RecordedRunReplay["shown"] = [];
  const answered: number[] = [];

  // Where the log stops. A run whose last logged decision ran a call is stopped
  // right after that call, by the loop's own signal, so it ends `cancelled`
  // at the top of the next iteration -- before that iteration builds anything
  // for a decision the build never asked for. Any other run is cancelled on the
  // next decision, once that decision has been shown what it would have been
  // shown. (It used to be answered with something the loop could not read,
  // which ended the loop `invalid_decision`; such an answer is now asked again,
  // t211.)
  const last = logged[logged.length - 1]!;
  const stopAfterCall = !options.pastLog && last.kind === "tool_call" && last.events.some((event) => event.kind === "call");
  const controller = new AbortController();

  const page = (callId: string, over: JsonObject): JsonObject => padded({ ...over, location: START, observedBy: callId, state: world }, pageBytes);

  const tools: AutomationStudioLlmEvidenceTool[] = [
    automationStudioLlmRunNodeTool({ nodeIds: ["web.click", "web.navigate", "web.type", SNAPSHOT.node, "web.extract.list"], initial: structuredClone(SNAPSHOT) })!,
    {
      toolId: DETECT_TOOL_ID,
      description: "Find the repeating structure near a region of the page and issue a handle for it.",
      inputSchema: { type: "object" },
      effect: "observe"
    }
  ];

  const executeTool = async ({ callId, toolId, value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    const code = codes.get(callId);
    if (code === undefined) throw new Error(`recorded run ${name}: the loop ran ${callId}, which the log never ran`);
    if (!rebuilt.length) rebuilt.push({ iteration: 0, kind: "initial", events: [] });
    current().events.push({ kind: "call", callId, toolId, code });
    // A dry-run call: the reset, then each proposed step again.
    if (value.replay === "reset") {
      attemptEpoch += 1;
      world += 1;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, replay: "reset" }, effectApplied: true, resultCode: code };
    }
    if (value.replay === "step") {
      const replayed = code === "core.replay.replayed";
      if (replayed && value.node !== "web.extract.list") world += 1;
      return {
        kind: "llm_evidence_tool_execution",
        evidence: replayed ? { ok: true, replay: "step", replayed: true } : page(callId, { ok: false, code: code.split(".").pop()! }),
        effectApplied: replayed,
        resultCode: code
      };
    }
    const kind = kindOf(callId, toolId, code);
    const node = nodeFor(callId, kind);
    const refused = code.includes(".rejected.");
    if (kind === "detect") {
      latestLook = { toolId, input: value, epoch: attemptEpoch };
      return { kind: "llm_evidence_tool_execution", evidence: padded({ ok: true, code, handle: `list.${callId}`, observedBy: callId, state: world }, detectBytes), effectApplied: false, resultCode: code };
    }
    if (kind === "action") {
      attemptEpoch += 1;
      if (!refused) world += 1;
    } else if (!refused) latestLook = { toolId, input: value, epoch: attemptEpoch };
    const reads = kind === "read";
    if (stopAfterCall && current().iteration === last.iteration) controller.abort();
    // A refusal names no replay: a step that did not work is nothing to run again.
    const draft = {
      actionId: node,
      input: value,
      effect: kind === "action" ? "mutate" as const : "observe" as const,
      proposes: kind !== "snapshot",
      ...(refused ? {} : {
        ranWith: { node, parameters: { target: { selector: `#${callId}` } }, consequences: [] },
        ...(kind === "snapshot" ? {} : { replay: { from: { location: START }, ...(reads ? { produced: { records: 3 } } : {}) } })
      })
    };
    return {
      kind: "llm_evidence_tool_execution",
      evidence: refused
        ? page(callId, { ok: false, code: code.split(".").pop()!, node })
        : page(callId, { ok: true, node, status: "succeeded", pageChanged: kind === "action", inFlow: kind !== "snapshot" }),
      effectApplied: !refused && kind !== "snapshot",
      resultCode: code,
      draft
    };
  };

  const decide = async ({ iteration, evidence }: { iteration: number; evidence: ReadonlyArray<RecordedEvidenceEntry> }): Promise<unknown> => {
    shown.push({ iteration, evidence: structuredClone([...evidence]) });
    const entry = byIteration.get(iteration);
    // Past the last logged decision the run ends: cancelled, which hands the trace back with it.
    if (!entry || entry.kind === "initial") {
      controller.abort();
      throw new Error(`recorded run ${name}: past the log at decision ${iteration}`);
    }
    rebuilt.push({ iteration, kind: entry.kind, events: [] });
    // The completed result is not logged. Each one is worded differently, as a
    // model rewords its summary, so crossborder's 12 and 13 are caught as the
    // same attempt only because they met the same refusal over the same draft
    // (`../recorder.ts`) -- never because the prose happened to match.
    if (entry.kind === "complete") return { kind: "complete", result: { summary: `Recorded run ${name}, decision ${iteration}.` } };
    if (entry.kind === "amend_draft") {
      const amendments = run.amendments[iteration];
      if (!amendments) throw new Error(`recorded run ${name}: no amendment scripted for decision ${iteration}`);
      return { kind: "amend_draft", amendments: structuredClone(amendments) };
    }
    const call = entry.events.find((event): event is Extract<LoggedEvent, { kind: "call" }> => event.kind === "call");
    if (!call) {
      // Answered from memory: the exact request of the latest look in this attempt epoch.
      if (!latestLook || latestLook.epoch !== attemptEpoch) throw new Error(`recorded run ${name}: decision ${iteration} was answered from memory, but no look was made in its attempt epoch`);
      answered.push(iteration);
      return { kind: "tool_call", callId: `asked.${iteration}`, toolId: latestLook.toolId, input: structuredClone(latestLook.input) };
    }
    return { kind: "tool_call", callId: call.callId, toolId: call.toolId, input: requestFor(call.callId, kindOf(call.callId, call.toolId, call.code)) };
  };

  const checkCompletion = (_result: JsonObject, _context: unknown): AutomationStudioLlmEvidenceCompletionCheck => {
    const iteration = current().iteration;
    const check = run.checks[iteration];
    if (!check) throw new Error(`recorded run ${name}: no completion check scripted for decision ${iteration}`);
    if (check === "ok") return { ok: true };
    if (run.logsChecks) current().events.push({ kind: "check", text: `check ok=false issues=${check.codes.join(",")}` });
    return { ok: false, issueCodes: [...check.codes], feedback: structuredClone(check.feedback) };
  };

  // The service's limits for a 48-call grant (`../../../service.ts:1571,1585-1631`).
  const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 48 });
  const fixedClock = 1_790_000_000_000;
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools,
    propagateDecisionErrors: true,
    unusableDecisions: { maxConsecutive: limits.maxConsecutiveUnusableDecisions, stalled: () => new Error(`recorded run ${name}: stalled`) },
    checkCompletion,
    // These builds ran before a look asked again was run once more to check
    // the page, and before an ignored redirect withdrew looks (t196). Their
    // later decisions were made under neither, so the replay keeps both out: no
    // state digests, so every repeat is answered from memory as it was, and
    // looks stay on offer. `../../decision-handlers/tests/state-digest-cost.test.ts` replays a
    // recorded build with both.
    lookWithdrawal: false,
    // And every step that ran was kept unless withdrawn: the model did not author these drafts (`../../loop-configuration.ts`, `draftAuthoring`).
    draftAuthoring: "transcript",
    ...limits.loop,
    budget: { ...limits.loop.budget, now: () => fixedClock },
    decide,
    executeTool,
    signal: controller.signal
  });

  return {
    name,
    shown,
    trace: result.trace,
    result,
    rebuilt: rebuilt.map(logLine),
    logged: logged.map(logLine),
    expected: expected.map(logLine),
    diverges: Object.fromEntries(Object.entries(run.now ?? {}).map(([iteration, change]) => [iteration, change.why])),
    answered,
    coreEntries: coreEntries(shown, result.trace)
  };
}

/** The Core entries a run is known to have added, and the first decision each was there for. */
function coreEntries(shown: RecordedRunReplay["shown"], trace: readonly AutomationStudioLlmEvidenceLoopTrace[]): RecordedCoreEntry[] {
  const found = new Map<string, RecordedCoreEntry>();
  const add = (entry: RecordedCoreEntry): void => {
    const known = found.get(entry.callId);
    if (!known || entry.before < known.before) found.set(entry.callId, entry);
  };
  // Seen in some window: first there for the first decision that saw it.
  for (const { iteration, evidence } of shown) {
    for (const entry of evidence) {
      if (!entry.toolId.startsWith("core.") || entry.toolId === "core.flow_draft" || entry.toolId === "core.budget" || entry.toolId === "core.evidence_history") continue;
      add({ callId: entry.callId, toolId: entry.toolId, before: iteration });
    }
  }
  // Implied by the trace, whether or not any window carried it.
  for (const row of trace) {
    const next = row.iteration + 1;
    if (row.decision === "tool_call" && !row.callId && (row.resultCode?.startsWith("llm_evidence_loop.already_") || row.resultCode === "llm_evidence_loop.not_offered")) add({ callId: `core.request_check.${row.iteration}`, toolId: "core.request_check", before: next });
    if (row.decision === "amend_draft" && (row.amendmentsRefused?.length || row.resultCode === "llm_evidence_loop.draft_amendment_undone")) add({ callId: `core.amendment_check.${row.iteration}`, toolId: "core.amendment_check", before: next });
    if (row.decision === "unusable" && row.resultCode && row.resultCode !== "llm_evidence_loop.dry_run_refused" && !row.resultCode.startsWith("llm_output.") && !row.resultCode.startsWith("llm.")) {
      add({ callId: `core.completion_check.${row.iteration}`, toolId: "core.completion_check", before: next });
    }
  }
  return [...found.values()].sort((left, right) => left.before - right.before || left.callId.localeCompare(right.callId));
}
