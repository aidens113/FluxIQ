import { asRecord, textOf } from "../../home/model";
import type { RunClient, RunRow } from "./types";

type Extras = Pick<RunRow, "client" | "howRan" | "startedBy" | "confirmedBy">;

function firstText(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const text = textOf(record[key]);
    if (text) return text.toLowerCase();
  }
  return undefined;
}

function clientOf(text: string | undefined): RunClient | undefined {
  if (!text) return undefined;
  if (/extension|chrome|firefox|edge|browser/.test(text)) return "extension";
  if (/program|sdk|api|cli|script|fluxnode/.test(text)) return "program";
  if (/panel|web/.test(text)) return "panel";
  return undefined;
}

function howOf(text: string | undefined): string | undefined {
  if (!text) return undefined;
  if (/replay/.test(text)) return "replayed";
  if (/explor/.test(text)) return "explored";
  if (/repair/.test(text)) return "repaired";
  return undefined;
}

function confirmedOf(text: string | undefined): string | undefined {
  return text === "type" || text === "check" || text === "judge" ? text : undefined;
}

/**
 * What a run's free-form metadata says about where and how it ran. Only values it states in words this
 * page knows are kept; anything else stays absent rather than guessed.
 */
export function readRunExtras(metadata: unknown): Extras {
  const record = asRecord(metadata);
  if (!record) return {};
  const extras: Extras = {};
  const client = clientOf(firstText(record, ["client", "clientKind", "startedFrom", "origin"]));
  if (client) extras.client = client;
  const how = howOf(firstText(record, ["howRan", "runMode", "mode", "origin"]));
  if (how) extras.howRan = how;
  const by = textOf(record.startedBy) ?? textOf(record.initiator) ?? textOf(record.requestedBy);
  if (by) extras.startedBy = by;
  const confirmed = confirmedOf(firstText(record, ["verdictBy", "confirmedBy"]));
  if (confirmed) extras.confirmedBy = confirmed;
  return extras;
}
