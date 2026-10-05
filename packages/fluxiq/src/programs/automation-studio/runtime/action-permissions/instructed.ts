// What the person's own instruction already asks for, as consequence classes.
//
// The user's rule: nothing destructive "without explicit instructions". So an
// instruction is itself a permission. "Refund order 1042" asks for money to move;
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
//
// **One answer per act the person asked for (t174-w107).** The question used
// to be about classes alone: which of five classes do the words ask for, at
// most one entry each. Run `run-musp8nz1-dbd3905a` asked to put three hubs in
// the cart and to collect the store's coupon; its read answered `create_new`
// for the cart and nothing for the coupon -- a class already given needs no
// second entry, and Core kept one entry per class even when two were given --
// so the build's test had no word that the coupon lasts and treated it as
// repeatable. Where the instruction's acts are read (`../flow-bootstrap/
// instructed-acts/instruction-acts.ts`, no model), the question now names each
// act by id with the person's own words and asks for its consequences one act
// at a time (`automationStudioInstructedConsequencesSchema`). An act answered
// with classes adds one grounded entry per class quoting that act, beside the
// free answer, so two acts of one class are two entries. An act split from
// one clause with several counted objects ("add two packs of ... and one pack
// of ... to my cart", t262) has a quote Core assembled from the verb and its
// own object, which is not the person's contiguous words; its entries quote
// that original clause (`source.clause`) instead, and sibling splits of one
// class share the clause's one entry. An act left without an answer --
// skipped, malformed, or a read that failed -- is kept as unanswered
// (`consequences: null`). The build's tests treat an act as lasting by its own
// kind, by a grounded quote, or by an answer that names a class or is missing
// (`../flow-bootstrap/action-permissions.ts`, `instructedLastingActs`). The
// per-act answers ride beside the entries on the read the gate holds
// (`AutomationStudioInstructedRead`) and are never stored with a Flow: a
// stored entry keeps exactly its four fields.

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

/**
 * One act of the instruction as the read is asked about it: its id (`a1`,
 * `a2` ...), the person's own words for it, and, for an act split from a clause
 * with several counted objects, that clause and this act's object as the
 * person wrote them (`../flow-bootstrap/instructed-acts/contracts.ts`).
 */
export type AutomationStudioInstructedActText = { id: string; quote: string; source?: { clause: string; object: string } | undefined };

/**
 * What the read answered for one act: the classes it asks for, `[]` for an act
 * that asks for nothing lasting, or `null` when the read gave it no answer.
 */
export type AutomationStudioInstructedActRead = { act: string; quote: string; consequences: AutomationStudioActionConsequence[] | null };

/**
 * The read as a build holds it: the grounded entries, with each act's own
 * answer beside them as `acts`. A plain list of entries -- one stored with a
 * Flow, or given by an older caller -- has no `acts`, and its acts are judged
 * by their quotes alone.
 */
export type AutomationStudioInstructedRead = readonly AutomationStudioInstructedConsequence[] & { readonly acts?: readonly AutomationStudioInstructedActRead[] };

/** The word an act's answer uses for "nothing lasting". */
const NOTHING_LASTING = "none";

/**
 * The completion the read asks for. With no acts read from the instruction it
 * is `AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA`, the question as it
 * always was. With acts it asks first for one answer per act, keyed by the
 * act's id and described by the person's own words, every act required, and
 * then the free answer, which still catches what the act reader cannot name
 * (a refund is no act it reads).
 */
export function automationStudioInstructedConsequencesSchema(acts: readonly AutomationStudioInstructedActText[]): JsonObject {
  if (!acts.length) return AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA;
  const free = (AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA.properties as Record<string, JsonObject>).instructed!;
  return {
    type: "object",
    additionalProperties: false,
    required: ["acts", "instructed"],
    properties: {
      acts: {
        type: "object",
        additionalProperties: false,
        required: acts.map((act) => act.id),
        description: "Answer this first, from the person's instructions alone and not from anything a page shows. Each key is one act the instructions ask for, described by the person's own words. For every act, list each lasting consequence that act asks the automation to cause; one act often asks for more than one, as posting something creates it and publishes it. Answer [\"none\"] for an act that only opens, shows, finds or chooses something. Answer every act: an act left out is treated as lasting.",
        properties: Object.fromEntries(acts.map((act) => [act.id, {
          type: "array",
          minItems: 1,
          maxItems: AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length + 1,
          description: `The act "${act.quote}"`,
          items: { type: "string", enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES, NOTHING_LASTING] }
        }]))
      },
      instructed: structuredClone(free)
    }
  };
}

/**
 * A model's answer as a build holds it: the grounded free answer
 * (`readAutomationStudioInstructedConsequences`), then one entry per class
 * each act was answered with, quoting that act's own words where they are
 * found in an instruction, else the clause a split act came from where that is
 * found, and kept only then; never two entries of one class whose quotes
 * overlap, so sibling splits of one clause give one entry per class. Every
 * act's own answer rides beside them, under the act's own quote. An act whose
 * answer is missing or unreadable is `consequences: null`.
 */
export function readAutomationStudioInstructedRead(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
  acts: readonly AutomationStudioInstructedActText[];
}): AutomationStudioInstructedRead {
  const entries = readAutomationStudioInstructedConsequences(input);
  if (!input.acts.length) return entries;
  const answers = isRecord(input.result) && isRecord(input.result.acts) ? input.result.acts : {};
  const reads = input.acts.map((act): AutomationStudioInstructedActRead => ({ act: act.id, quote: act.quote, consequences: actAnswer(answers[act.id]) }));
  for (const [index, read] of reads.entries()) {
    const clause = input.acts[index]!.source?.clause;
    const found = groundedWords(read.quote, input.instructions) ?? (clause === undefined ? undefined : groundedWords(clause, input.instructions));
    if (!found) continue;
    const { quote, source } = found;
    for (const consequence of read.consequences ?? []) {
      // The free answer may quote the same clause shorter or longer than the act does: that clause has its entry.
      if (entries.some((entry) => entry.consequence === consequence && overlaps(entry.quote, quote))) continue;
      entries.push({ consequence, instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote });
    }
  }
  const ordered = AUTOMATION_STUDIO_ACTION_CONSEQUENCES.flatMap((consequence) => entries.filter((entry) => entry.consequence === consequence));
  return withActReads(ordered, reads);
}

/** The words with spacing folded, and the instruction that has them word for word; `undefined` when none does or they are out of bounds. */
function groundedWords(words: string, instructions: readonly AutomationStudioInstructionText[]): { quote: string; source: AutomationStudioInstructionText } | undefined {
  const quote = words.replace(/\s+/gu, " ").trim();
  if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) return undefined;
  const source = instructions.find((instruction) => comparable(`${instruction.title}\n${instruction.body}`).includes(comparable(quote)));
  return source ? { quote, source } : undefined;
}

/** A read in which no act was answered: what a read that failed holds, so each of its acts is treated as lasting. */
export function automationStudioInstructedReadUnanswered(acts: readonly AutomationStudioInstructedActText[]): AutomationStudioInstructedRead {
  return acts.length ? withActReads([], acts.map((act) => ({ act: act.id, quote: act.quote, consequences: null }))) : [];
}

/** Each act's own answer on a read, or `undefined` for a plain list of entries that carries none. */
export function automationStudioInstructedActReads(read: readonly AutomationStudioInstructedConsequence[] | undefined): readonly AutomationStudioInstructedActRead[] | undefined {
  return (read as AutomationStudioInstructedRead | undefined)?.acts;
}

/**
 * The entries with the acts' answers beside them. Not enumerable, so the list
 * copies, compares and serialises as the entries alone: what is stored with a
 * Flow is the four-field entries and nothing more.
 */
function withActReads(entries: AutomationStudioInstructedConsequence[], acts: readonly AutomationStudioInstructedActRead[]): AutomationStudioInstructedRead {
  return Object.defineProperty(entries, "acts", { value: Object.freeze([...acts]), enumerable: false });
}

/** Whether two quotes are one clause: either contains the other, compared as `comparable` reads them. */
function overlaps(left: string, right: string): boolean {
  const a = comparable(left);
  const b = comparable(right);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

/** One act's answer: its classes in Core's order, `[]` for nothing lasting, `null` for no readable answer. */
function actAnswer(value: unknown): AutomationStudioActionConsequence[] | null {
  const words = Array.isArray(value) ? value.filter((word): word is string => typeof word === "string").map((word) => word.trim().toLowerCase()) : typeof value === "string" ? [value.trim().toLowerCase()] : [];
  const classes = AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => words.includes(consequence));
  if (classes.length) return classes;
  return words.includes(NOTHING_LASTING) || (Array.isArray(value) && value.length === 0) ? [] : null;
}

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
