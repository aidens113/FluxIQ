import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import type { AutomationStudioProjectInstructionSource } from "./instruction-source.ts";
import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";

// The task spec: what the person asked for, split into parts, each grounded in
// the person's own words. The judge still receives the original instructions;
// the parts and `notAsked` are its checklist, never a replacement for them.
//
// A part's quote is a verbatim span of one active instruction source --
// exactly as written, not a paraphrase -- so a part the supervisor invented
// has nothing to quote and is refused. A lasting act is one of the permission
// gate's consequence classes, so every act a part asks for is one the gate
// already knows how to ask a person about.

export type AutomationStudioProjectTaskPart = {
  id: string;
  quote: { sourceId: string; text: string };
  goalFacts: string[];
  lastingActs: AutomationStudioActionConsequence[];
};

export type AutomationStudioProjectTaskSpec = {
  parts: AutomationStudioProjectTaskPart[];
  notAsked: string[];
  digest: string;
};

const VERSION = "project.task_spec.v1";
const LIMITS = { parts: 50, quote: 4000, facts: 50, fact: 500, notAsked: 50 } as const;

export const automationStudioProjectTaskSpec = Object.freeze({
  /** The digest of a spec's content; the `digest` field is excluded. */
  digest(spec: Omit<AutomationStudioProjectTaskSpec, "digest">): string {
    return automationStudioProjectDigest(VERSION, { parts: spec.parts, notAsked: spec.notAsked });
  },

  /** Reads a spec and refuses one whose digest is not the digest of what it says. */
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectTaskSpec> {
    return shape.parse(() => read(value));
  },

  /** Every quote is a verbatim span of an active source it names. */
  quoteIssues(spec: AutomationStudioProjectTaskSpec, sources: readonly AutomationStudioProjectInstructionSource[]): Array<{ code: string; path: string }> {
    const issues: Array<{ code: string; path: string }> = [];
    for (const [index, part] of spec.parts.entries()) {
      const source = sources.find((candidate) => candidate.sourceId === part.quote.sourceId);
      if (!source) issues.push({ code: "project.quote_source_unknown", path: `taskSpec.parts.${index}.quote.sourceId` });
      else if (!source.text.includes(part.quote.text)) issues.push({ code: "project.quote_not_verbatim", path: `taskSpec.parts.${index}.quote.text` });
    }
    return issues;
  }
});

function read(value: unknown): AutomationStudioProjectTaskSpec {
  const fields = shape.object(value, "taskSpec", ["parts", "notAsked", "digest"]);
  const rawParts = shape.array(fields.parts, "taskSpec.parts", LIMITS.parts);
  if (!rawParts.length) return shape.refuse("project.task_spec_empty", "taskSpec.parts");
  const parts = rawParts.map((part, index) => readPart(part, `taskSpec.parts.${index}`));
  if (new Set(parts.map((part) => part.id)).size !== parts.length) return shape.refuse("project.duplicate_part", "taskSpec.parts");
  const notAsked = shape.array(fields.notAsked, "taskSpec.notAsked", LIMITS.notAsked).map((item, index) => shape.text(item, `taskSpec.notAsked.${index}`, LIMITS.fact));
  const digest = shape.digest(fields.digest, "taskSpec.digest");
  if (digest !== automationStudioProjectTaskSpec.digest({ parts, notAsked })) return shape.refuse("project.task_spec_digest_mismatch", "taskSpec.digest");
  return { parts, notAsked, digest };
}

function readPart(value: unknown, path: string): AutomationStudioProjectTaskPart {
  const fields = shape.object(value, path, ["id", "quote", "goalFacts", "lastingActs"]);
  const quote = shape.object(fields.quote, `${path}.quote`, ["sourceId", "text"]);
  const lastingActs = shape.array(fields.lastingActs, `${path}.lastingActs`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length)
    .map((act, index) => shape.oneOf(act, `${path}.lastingActs.${index}`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES));
  if (new Set(lastingActs).size !== lastingActs.length) return shape.refuse("project.duplicate", `${path}.lastingActs`);
  return {
    id: shape.id(fields.id, `${path}.id`),
    quote: { sourceId: shape.id(quote.sourceId, `${path}.quote.sourceId`), text: shape.text(quote.text, `${path}.quote.text`, LIMITS.quote) },
    goalFacts: shape.array(fields.goalFacts, `${path}.goalFacts`, LIMITS.facts).map((fact, index) => shape.text(fact, `${path}.goalFacts.${index}`, LIMITS.fact)),
    lastingActs
  };
}
