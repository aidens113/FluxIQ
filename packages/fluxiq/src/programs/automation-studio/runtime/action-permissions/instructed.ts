// What the person's own instruction already asks for, as consequence classes.
//
// The user's rule: nothing destructive "without explicit instructions". So an
// instruction is itself a grant. "Refund order 1042" asks for money to move;
// "Schedule a post for Friday" asks for something to be created and published;
// "Extract the posts due this week" asks for neither, and a run that reached
// for a delete or a send while doing it has to ask.
//
// **The model judges, Core checks.** Which classes an instruction asks for is a
// question about meaning -- "update the address" asks for an existing record to
// change, whichever control then saves it -- so a model reads the instruction.
// It must quote the person's own words for every class it claims, and Core
// keeps a claim only when that quote is, word for word, part of one of the
// person's active instructions. A claim Core cannot find there is dropped, and
// a derivation that fails claims nothing: the run then asks rather than acts.
//
// **Derived once, kept with the Flow.** A saved Flow is replayed with no model
// at all, so the answer cannot be re-derived at run time. Each entry carries
// the digest of the instruction text it was read from; the set is stored on
// the proposal and on the Flow it builds, and `currentAutomationStudio-
// InstructedConsequences` keeps an entry only while that instruction is active
// and its text still has that digest. Edit the instruction and the authority
// it gave lapses until a build derives it again.

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "./consequences.ts";

/** One class the person's instruction plainly asks for, and the words that ask. */
export type AutomationStudioInstructedConsequence = {
  consequence: AutomationStudioActionConsequence;
  instructionId: string;
  /** `sha256:` of the instruction's title and body as they read when this was derived. */
  instructionDigest: string;
  /** The person's own words, exactly as their instruction has them. */
  quote: string;
};

/** An instruction as the derivation and the staleness check read it. */
export type AutomationStudioInstructionText = { instructionId: string; title: string; body: string };

const MAX_QUOTE = 300;
const MIN_QUOTE = 3;
const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/**
 * What the model is asked, as the completion it must return. The descriptions
 * carry the question; the class descriptions are where "schedule a post"
 * becomes both a new thing and a published one, so an instructed schedule is
 * not asked about again.
 *
 * Leaving that to the class descriptions alone did not work. Live
 * (`run-mud7fssy-902f877b`), the instruction "Schedule a post to the Northwind
 * Trails account ... saying: Trail clean-up on Saturday" was read as asking for
 * `send_or_publish` and nothing else, so when the build reached for the control
 * it had read as `create_new` the run stopped to ask the person for a class
 * their own instruction plainly asks for. Both descriptions list "schedule";
 * the model still answered with the closest single class. So the question now
 * says, in the field the answer is given in, that one act often asks for
 * several -- which is where a model reading "one entry for each" looks.
 */
export const AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA: JsonObject = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["instructed"],
  properties: {
    instructed: {
      type: "array",
      maxItems: AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length,
      description: "Answer only this, from the person's instructions alone and not from anything a page shows: which lasting consequences do the instructions plainly ask the automation to cause? One entry for each consequence they plainly ask for, quoting the words that ask for it. One act they ask for often asks for more than one: scheduling or posting something creates a new thing that stays and publishes it to others, a refund moves money and changes an order that already exists, replacing a document creates one and changes what was there. Give every class the words ask for, not only the closest one. Leave a consequence out when the instructions forbid it, only mention it, describe something that already happened, or do not clearly ask for it. An empty list is a complete answer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["consequence", "quote"],
        properties: {
          consequence: {
            type: "string",
            enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES],
            description: "move_money: spend, charge, pay, refund or transfer money, or place an order that will be paid for. delete: delete, remove or cancel something so that it is gone. send_or_publish: send, reply, post, publish, share or schedule something that other people or systems will receive or see. modify_existing: change, edit, update, rename, mark, assign, resolve, move or save changes to something that already exists. create_new: create, add, raise, book or schedule something new that stays."
          },
          quote: {
            type: "string",
            minLength: MIN_QUOTE,
            maxLength: MAX_QUOTE,
            description: "The words of the instruction that ask for it, copied exactly as the instruction has them."
          }
        }
      }
    }
  }
});

/** The digest an instructed entry is bound to: the instruction's title and body, as a person wrote them. */
export function automationStudioInstructionDigest(instruction: Pick<AutomationStudioInstructionText, "title" | "body">): string {
  return `sha256:${createHash("sha256").update(`${instruction.title}\n${instruction.body}`, "utf8").digest("hex")}`;
}

/**
 * The classes a model's answer claims, kept only where its quote is found word
 * for word in one of the instructions it was shown. One entry per class, the
 * first grounded claim winning. Anything malformed claims nothing.
 */
export function readAutomationStudioInstructedConsequences(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
}): AutomationStudioInstructedConsequence[] {
  const claims = isRecord(input.result) && Array.isArray(input.result.instructed) ? input.result.instructed : [];
  const found = new Map<AutomationStudioActionConsequence, AutomationStudioInstructedConsequence>();
  for (const claim of claims.slice(0, AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length * 2)) {
    if (!isRecord(claim) || !isAutomationStudioActionConsequence(claim.consequence) || typeof claim.quote !== "string" || found.has(claim.consequence)) continue;
    const quote = claim.quote.replace(/\s+/gu, " ").trim();
    if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) continue;
    const source = input.instructions.find((instruction) => comparable(`${instruction.title}\n${instruction.body}`).includes(comparable(quote)));
    if (!source) continue;
    found.set(claim.consequence, {
      consequence: claim.consequence,
      instructionId: source.instructionId,
      instructionDigest: automationStudioInstructionDigest(source),
      quote
    });
  }
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.flatMap((consequence) => {
    const entry = found.get(consequence);
    return entry ? [entry] : [];
  });
}

/**
 * The stored entries that still stand, and those that lapsed.
 *
 * An entry stands only while its instruction is among the active ones and its
 * text still has the digest the entry was derived from. Anything that does not
 * parse is not an entry. Nothing here calls a model, so a replay with none can
 * read it.
 */
export function currentAutomationStudioInstructedConsequences(input: {
  stored: unknown;
  activeInstructions: readonly AutomationStudioInstructionText[];
}): { current: AutomationStudioInstructedConsequence[]; lapsed: AutomationStudioInstructedConsequence[] } {
  const current: AutomationStudioInstructedConsequence[] = [];
  const lapsed: AutomationStudioInstructedConsequence[] = [];
  for (const entry of Array.isArray(input.stored) ? input.stored.map(parseEntry) : []) {
    if (!entry) continue;
    const instruction = input.activeInstructions.find((candidate) => candidate.instructionId === entry.instructionId);
    if (instruction && automationStudioInstructionDigest(instruction) === entry.instructionDigest) current.push(entry);
    else lapsed.push(entry);
  }
  return { current, lapsed };
}

function parseEntry(value: unknown): AutomationStudioInstructedConsequence | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !["consequence", "instructionId", "instructionDigest", "quote"].includes(key))) return null;
  if (!isAutomationStudioActionConsequence(value.consequence) || typeof value.instructionId !== "string" || !ID.test(value.instructionId)
    || typeof value.instructionDigest !== "string" || !DIGEST.test(value.instructionDigest)
    || typeof value.quote !== "string" || value.quote.length < MIN_QUOTE || value.quote.length > MAX_QUOTE) return null;
  return { consequence: value.consequence, instructionId: value.instructionId, instructionDigest: value.instructionDigest, quote: value.quote };
}

/** Case, spacing and typographic quotes do not decide whether words were copied. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[‘’]/gu, "'").replace(/[“”]/gu, "\"").replace(/\s+/gu, " ").trim().replace(/[.,;:!]+$/u, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
