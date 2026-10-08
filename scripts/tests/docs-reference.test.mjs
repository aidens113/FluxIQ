import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { frameworkReferenceMarkdown } from "../docs-reference.mjs";

const root = path.resolve("/fluxiq-root");
const VALUE = 64;
const TYPE = 2097152;

function reflection(name, kind, file, line, summary) {
  return {
    name,
    kind,
    sources: [{ fileName: path.join(root, file), line }],
    comment: summary ? { summary: [{ kind: "text", text: summary }] } : undefined,
  };
}

function surface({ firstName = "runFlow", firstLine = 12, secondLine = 40 } = {}) {
  return [
    reflection(firstName, VALUE, "packages/fluxiq/src/runtime/run.ts", firstLine, "Runs a Flow."),
    reflection("FlowStep", TYPE, "packages/fluxiq/src/model/step.ts", secondLine),
  ];
}

test("moving an export to another line leaves the reference unchanged", () => {
  const before = frameworkReferenceMarkdown(surface(), root);
  const after = frameworkReferenceMarkdown(surface({ firstLine: 310, secondLine: 3 }), root);
  assert.equal(after, before);
  assert.doesNotMatch(before, /\.ts:\d/);
  assert.match(before, /\| `runFlow` \| Value \| `packages\/fluxiq\/src\/runtime\/run\.ts` \| Runs a Flow\. \|/);
});

test("adding an export changes the reference", () => {
  const before = frameworkReferenceMarkdown(surface(), root);
  const after = frameworkReferenceMarkdown([...surface(), reflection("stopFlow", VALUE, "packages/fluxiq/src/runtime/stop.ts", 5)], root);
  assert.notEqual(after, before);
  assert.match(after, /`stopFlow`/);
  assert.match(after, /- Public declarations: 3/);
});

test("renaming an export changes the reference", () => {
  const before = frameworkReferenceMarkdown(surface(), root);
  const after = frameworkReferenceMarkdown(surface({ firstName: "startFlow" }), root);
  assert.notEqual(after, before);
  assert.match(after, /`startFlow`/);
  assert.doesNotMatch(after, /`runFlow`/);
});

test("moving an export to another file changes the reference", () => {
  const before = frameworkReferenceMarkdown(surface(), root);
  const moved = surface();
  moved[0] = reflection("runFlow", VALUE, "packages/fluxiq/src/runtime/runner.ts", 12, "Runs a Flow.");
  assert.notEqual(frameworkReferenceMarkdown(moved, root), before);
});
