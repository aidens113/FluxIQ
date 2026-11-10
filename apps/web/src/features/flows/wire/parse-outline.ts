import { asRecord, textOf } from "../../home/model";
import type { FlowOutline, OutlineArm, OutlineIssue, OutlineLink, OutlinePort, OutlineStep } from "./types";

const LINK_KINDS = new Set<OutlineLink["kind"]>(["flow", "subflow", "part", "fluxnode"]);

/**
 * A Flow's list of steps as `get-flow-outline` and `edit-flow-steps` send it, or undefined
 * when the answer is not one. A step missing its words or kind is dropped with its own steps
 * rather than shown blank; every list field defaults to empty.
 */
export function parseOutline(value: unknown): FlowOutline | undefined {
  const row = asRecord(value);
  const steps = row ? listOf(row.steps, readStep) : undefined;
  if (!row || !steps) return undefined;
  const contract = asRecord(row.interface);
  return {
    interface: { needs: listOf(contract?.needs, readPort) ?? [], gives: listOf(contract?.gives, readPort) ?? [] },
    steps,
    issues: listOf(row.issues, readIssue) ?? []
  };
}

function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const found = read(item);
    return found === undefined ? [] : [found];
  });
}

function readStep(value: unknown): OutlineStep | undefined {
  const row = asRecord(value);
  const kind = textOf(row?.kind);
  if (!row || !kind || typeof row.words !== "string") return undefined;
  const step: OutlineStep = {
    number: typeof row.number === "string" ? row.number : "",
    nodeIds: listOf(row.nodeIds, textOf) ?? [],
    kind,
    words: row.words,
    lasting: listOf(row.lasting, textOf) ?? [],
    children: listOf(row.children, readStep) ?? [],
    arms: listOf(row.arms, readArm) ?? []
  };
  const link = readLink(row.link);
  if (link) step.link = link;
  return step;
}

function readArm(value: unknown): OutlineArm | undefined {
  const row = asRecord(value);
  if (!row || typeof row.words !== "string") return undefined;
  return { words: row.words, steps: listOf(row.steps, readStep) ?? [] };
}

function readLink(value: unknown): OutlineLink | undefined {
  const row = asRecord(value);
  const kind = textOf(row?.kind);
  const id = textOf(row?.id);
  if (!kind || !id || !LINK_KINDS.has(kind as OutlineLink["kind"])) return undefined;
  return { kind: kind as OutlineLink["kind"], id };
}

function readPort(value: unknown): OutlinePort | undefined {
  const row = asRecord(value);
  const id = textOf(row?.id);
  if (!row || !id) return undefined;
  return { id, name: textOf(row.name) ?? id, type: textOf(row.type) ?? "a value", required: row.required === true };
}

function readIssue(value: unknown): OutlineIssue | undefined {
  const row = asRecord(value);
  const words = textOf(row?.words);
  if (!row || !words) return undefined;
  const step = textOf(row.step);
  return { code: textOf(row.code) ?? "unstructured", words, ...(step ? { step } : {}) };
}
