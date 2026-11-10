import type { JsonValue } from "../../../../core/index.ts";
import type { OutlineDataStep } from "./data-step.ts";

/**
 * One edit a person makes on the outline, naming steps by their numbers.
 *
 * - `set-value`: one value of the step, at `path` inside what the step is
 *   given (a recorded step's payload, otherwise its parameters);
 * - `bind-input`: the same value read from one of the Flow's inputs instead;
 * - `set-words`: the step's label;
 * - `move`: one place up or down inside its own block;
 * - `delete`: the step, joining the steps either side of it;
 * - `add-call`, `add-data`: a new step after `after`, or first when it is left out.
 */
export type OutlineEdit =
  | { kind: "set-value"; step: string; path: string[]; value: JsonValue }
  | { kind: "bind-input"; step: string; path: string[]; input: string }
  | { kind: "set-words"; step: string; words: string }
  | { kind: "move"; step: string; direction: "up" | "down" }
  | { kind: "delete"; step: string }
  | { kind: "add-call"; after?: string; flow: { flowId: string; name: string }; nodeId?: string }
  | { kind: "add-data"; after?: string; data: OutlineDataStep; nodeId?: string };
