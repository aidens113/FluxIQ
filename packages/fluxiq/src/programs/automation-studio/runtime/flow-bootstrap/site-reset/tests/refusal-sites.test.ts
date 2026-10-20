import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetCreateBaselines,
  AutomationStudioSiteResetLedger,
  automationStudioSiteResetTrialPolicy,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// t743, the actionable-answer contract: every site-reset refusal goes through
// the one constructor in `../../reset-answers/`, which makes it name its failed
// condition and whether any call can meet it. Enforced here mechanically: a
// scan of every site-reset, reset-settlement and reset-answers source file, tests excluded,
// fails when a `candidate.*` refusal is written anywhere else. Then each
// refusal site, as the model would receive it.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ANSWERS = fileURLToPath(new URL("../../reset-answers", import.meta.url));
/** The settlement modules, moved out of site-reset (t743): no refusal may be written there either. */
const SETTLEMENT = fileURLToPath(new URL("../../reset-settlement", import.meta.url));

/** Every site-reset source file, tests excluded, with its path from the site-reset root. */
function sources(directory = ROOT): Array<{ path: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sources(full);
    return entry.name.endsWith(".ts") ? [{ path: full, text: readFileSync(full, "utf8") }] : [];
  });
}

/** `text` with its comments blanked and its strings kept, so a code in a comment never counts and one in code always does. */
function code(text: string): string {
  let out = "";
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!, next = text[index + 1];
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 1;
      out += " ";
    } else {
      if (char === "\"" || char === "'" || char === "`") quote = char;
      out += char;
    }
  }
  return out;
}

/** What in one source file builds a `candidate.*` refusal other than through the constructor. */
function violations(text: string): string[] {
  const stripped = code(text);
  const found: string[] = [];
  // A code written as a property or a variable: `code: "candidate.x"` or `const code = "candidate.x"`.
  for (const match of stripped.matchAll(/\bcode\s*[:=]\s*["'`]candidate\./gu)) found.push(`code literal: ${match[0]}`);
  // A refusal object written by hand: `ok: false,` as a value (a type literal separates with `;`).
  for (const match of stripped.matchAll(/\bok\s*:\s*false\s*[,}]/gu)) found.push(`hand-built refusal: ${match[0]}`);
  // Any other `candidate.*` literal must be the constructor's code or a comparison with one.
  for (const match of stripped.matchAll(/["'`]candidate\.[a-z_]+["'`]/gu)) {
    const at = match.index ?? 0;
    const before = stripped.slice(Math.max(0, at - 40), at);
    if (!/(?:\brefusal|\bautomationStudioSiteResetRefusal)\(\s*$|[!=]==\s*$/u.test(before)) found.push(`stray code: ${match[0]}`);
  }
  return found;
}

describe("every site-reset refusal goes through the constructor", () => {
  it("the scan catches each way of writing one by hand, and passes the constructor and a comparison", () => {
    expect(violations(`return { ok: false, code: "candidate.x", instruction: "y" };`)).not.toEqual([]);
    expect(violations(`const code = "candidate.x"; return { kind: "refuse", evidence: { code } };`)).not.toEqual([]);
    expect(violations(`evidence: { ok: false, code, instruction }`)).toHaveLength(1);
    expect(violations(`codes.push("candidate.x");`)).toHaveLength(1);
    expect(violations(`refusal("candidate.x", { failed: "act_kept", canMeet: "no_call", instruction: WORDS.keptAct() })`)).toEqual([]);
    expect(violations(`automationStudioSiteResetRefusal("candidate.x", answer)`)).toEqual([]);
    expect(violations(`if (evidence.code === "candidate.x") return;`)).toEqual([]);
    expect(violations(`// was { ok: false, code: "candidate.x" }\n/* code: "candidate.y" */ const type: { ok: false; code: string } = value;`)).toEqual([]);
  });

  it("finds no refusal written outside reset-answers/, in site-reset, reset-settlement or any subdirectory", () => {
    const files = [...sources(), ...sources(SETTLEMENT), ...sources(ANSWERS)];
    expect(files.some((file) => file.path.startsWith(SETTLEMENT) && file.path.endsWith("judge.ts"))).toBe(true);
    expect(files.some((file) => file.path.endsWith("undo-admission.ts"))).toBe(true);
    expect(files.some((file) => file.path.startsWith(ANSWERS))).toBe(true);
    const found = files.filter((file) => !file.path.startsWith(ANSWERS)).flatMap((file) => violations(file.text).map((violation) => `${relative(ROOT, file.path)}: ${violation}`));
    expect(found).toEqual([]);
  });
});

/** The answer named `failed` and `canMeet`, in words. */
const named = (code: string, failed: Parameters<typeof WORDS.condition>[0], canMeet: Parameters<typeof WORDS.condition>[1]) => ({ ok: false, code, failed, canMeet, condition: WORDS.condition(failed, canMeet) });
const acted = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot = {}, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot = {}) => ({ effect: "mutate" as const, consequences, control });
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });

describe("each refusal site names its failed condition (ledger claims and targets)", () => {
  it("an act no undo may name: act_not_listed, on claim and on target, with actsToUndo as before", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("add", ["create_new"]));
    const listed = ledger.inPlace();
    expect(ledger.claim("act-9")).toMatchObject({ kind: "refused", evidence: { ...named("candidate.undo_unknown_act", "act_not_listed", "this_page"), instruction: WORDS.unknownAct(true), actsToUndo: listed } });
    expect(ledger.target("act-9", aim(["delete"]))).toMatchObject({ kind: "refused", evidence: { ...named("candidate.undo_unknown_act", "act_not_listed", "this_page"), actsToUndo: listed } });
  });

  it("an unissued ref: destination_unissued, met by another call here", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("add", ["create_new"]));
    expect(ledger.claim("act-1", "destination-7")).toMatchObject({ kind: "refused", evidence: { ...named("candidate.reset_destination_unissued", "destination_unissued", "this_page"), instruction: WORDS.destinationUnissued() } });
  });

  it("a spent undo: undo_spent; a kept act: act_kept; each met by no call", () => {
    const spent = new AutomationStudioSiteResetLedger();
    spent.explored(acted("add", ["create_new"]));
    spent.explored(acted("undo", ["delete"], {}, { undoes: "act-1", on: "created" }));
    expect(spent.claim("act-1")).toMatchObject({ kind: "refused", evidence: { ...named("candidate.undo_already_done", "undo_spent", "no_call"), act: "act-1", undoneBy: "undo" } });
    const kept = new AutomationStudioSiteResetLedger();
    kept.explored(acted("add", ["create_new"], { item: "i:one" }));
    kept.target("act-1", aim(["delete"], { item: "i:two" }));
    expect(kept.claim("act-1")).toMatchObject({ kind: "refused", evidence: { ...named("candidate.undo_act_kept", "act_kept", "no_call"), act: "act-1", instruction: WORDS.keptAct(false) } });
  });

  it("an unsettled kept reversible act refuses a trial: acts_not_settled", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const LIST = { scope: "p:documents", subject: "s:document" };
    // A trusted resource, so the list could still issue a ref: the act is to name one, not one no call can settle (t743).
    const observe = (subjects: string[]) => ledger.observed({ state: {}, location: "loc:documents", differs: [], resource: "r:documents", scope: LIST.scope, subjects, collections: [{ scope: LIST.scope, group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
    observe(["s:document"]);
    ledger.explored(acted("add", ["create_new"], { subject: "s:document", page: "s:document" }));
    observe(["s:document"]);
    await ledger.beforeTrial(back);
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { ...named("candidate.trial_reset_unproved", "acts_not_settled", "another_page"), actsToRestore: [{ act: "act-1" }], instruction: WORDS.unprovedReset() } });
  });
});

describe("each refusal site names its failed condition (trial policy, baselines)", () => {
  const act = { act: "act-1", did: "press \"Mark\" button" };
  const phase = { recorded: 1, refusals: 0, startDiffersSent: false };
  it("acts in place: acts_in_place; a start that only differs: start_differs", async () => {
    expect(await automationStudioSiteResetTrialPolicy({ phase, inPlace: [act], compare: async () => ({ moved: false, differs: [] }) })).toMatchObject({ kind: "refuse", evidence: { ...named("candidate.trial_reset_required", "acts_in_place", "another_page"), instruction: WORDS.resetRequired(false), actsToUndo: [act] } });
    expect(await automationStudioSiteResetTrialPolicy({ phase, inPlace: [], compare: async () => ({ moved: false, differs: ["a"] }) })).toMatchObject({ kind: "refuse", evidence: { ...named("candidate.trial_start_differs", "start_differs", "another_page"), instruction: WORDS.startDiffers(), differs: ["a"] } });
  });

  const SITE = "r:catalogue";
  const ENTRY: AutomationStudioSiteResetSpot = { subject: "s:volume", page: "s:volume", scope: "p:volume-page", resource: SITE };
  const declared = (control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[]) => ({ effect: "mutate" as const, consequences, control: { name: "Reserve", kind: "button", ...control } });
  const shelf: AutomationStudioSiteResetRead = { state: {}, differs: [], resource: SITE, scope: "p:shelf-page", location: "loc:shelf", collections: [{ scope: "p:shelf", group: "g:shelf", subjects: ["s:other"], states: { "s:other": "v:other" } }] };

  it("no witness before the seal: no_witness; no original for a creation: no_destination_original, met by no call once sealed with none", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    expect(baselines.check(declared(ENTRY, ["modify_existing"]), undefined)).toMatchObject({ kind: "refused", evidence: { ...named("candidate.reset_witness_required", "no_witness", "another_page"), instruction: WORDS.witnessRequired([]) } });
    expect(baselines.check(declared(ENTRY, ["create_new"]), undefined)).toMatchObject({ kind: "refused", evidence: { ...named("candidate.create_baseline_required", "no_destination_original", "another_page"), instruction: WORDS.createBaselineRequired() } });
    baselines.seal();
    expect(baselines.check(declared(ENTRY, ["create_new"]), undefined)).toMatchObject({ kind: "refused", evidence: named("candidate.create_baseline_required", "no_destination_original", "no_call") });
    const read = new AutomationStudioSiteResetCreateBaselines();
    read.observed(shelf);
    read.seal();
    expect(read.check(declared(ENTRY, ["create_new"]), undefined)).toMatchObject({ kind: "refused", evidence: named("candidate.create_baseline_required", "no_destination_original", "another_page") });
  });
});
