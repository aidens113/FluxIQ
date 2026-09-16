// Unit tests for the docs-links rule. The rule reaches the repository only
// through ctx, so these build a fake ctx by hand over in-memory documents: no
// git, no filesystem.
//
// Two things are worth proving beyond "a dead link fails". The first is that
// the anchor slug matches GitHub's, because a checker that disagrees with the
// renderer is worse than none: it either fails on links that work or passes
// links that do not. The cases below are the ones that were wrong in the first
// draft -- a heading whose text contains inline code, and an underscore, which
// GitHub keeps.
//
// The second is that nothing in a code example is read as a link. Documentation
// here quotes regular expressions, and `[a-z](x)` inside backticks is not a
// link to a file named x.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { run } from "../docs-links.mjs";

function makeCtx(files, dirs = ["docs"]) {
  return {
    CONFIG: { docsLinkDirs: dirs },
    trackedFiles: Object.keys(files),
    read: (file) => files[file],
    dirname: (file) => path.posix.dirname(file)
  };
}

const findingsFor = (files, dirs) => run(makeCtx(files, dirs));
const messagesFor = (files, dirs) => findingsFor(files, dirs).map((finding) => finding.message);

// --- Link targets ---

test("a link to a tracked file passes", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [b](./b.md).",
    "docs/architecture/b.md": "# B"
  }), []);
});

test("a link to a file that is not tracked fails", () => {
  const messages = messagesFor({ "docs/architecture/a.md": "See [b](./moved.md)." });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /docs\/architecture\/a\.md:1: the link to \.\/moved\.md is broken: no tracked file is at docs\/architecture\/moved\.md/);
});

test("a link up and across the tree resolves", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [the protocol](../working/protocol.md).",
    "docs/working/protocol.md": "# Protocol"
  }), []);
});

test("a link to a directory holding a README resolves", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [the guides](../guides/).",
    "docs/guides/README.md": "# Guides"
  }), []);
});

test("a link to a directory with no README fails", () => {
  const messages = messagesFor({
    "docs/architecture/a.md": "See [the guides](../guides/).",
    "docs/guides/one.md": "# One"
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /docs\/guides\/ is a directory with no README\.md/);
});

test("a link that climbs out of the repository fails", () => {
  const messages = messagesFor({ "docs/architecture/a.md": "See [core](../../../FluxIQ/docs/x.md)." });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /it points outside the repository/);
});

test("absolute URLs are not the build's to resolve", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "[site](https://getfluxiq.com) [mail](mailto:a@b.c) [img](data:image/png;base64,AA)"
  }), []);
});

test("a percent-encoded path resolves to the file it names", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [the plan](./30-Day%20Plan.md).",
    "docs/architecture/30-Day Plan.md": "# Plan"
  }), []);
});

test("an image target is checked like any other link", () => {
  const messages = messagesFor({ "docs/architecture/a.md": "![diagram](./diagram.png)" });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /no tracked file is at docs\/architecture\/diagram\.png/);
});

// --- Anchors ---

test("a fragment naming a heading in another file passes", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [why](./b.md#why-it-is-here).",
    "docs/architecture/b.md": "# B\n\n## Why it is here\n"
  }), []);
});

test("a fragment naming a heading that was reworded fails", () => {
  const messages = messagesFor({
    "docs/architecture/a.md": "See [why](./b.md#why-it-is-here).",
    "docs/architecture/b.md": "# B\n\n## Why this is here\n"
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /docs\/architecture\/b\.md has no heading or anchor "why-it-is-here"/);
});

test("a bare fragment is checked against the document it appears in", () => {
  const files = { "docs/architecture/a.md": "See [below](#the-shape).\n\n## The shape\n" };
  assert.deepEqual(messagesFor(files), []);
  files["docs/architecture/a.md"] = "See [below](#the-shape).\n\n## The form\n";
  const messages = messagesFor(files);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /this document has no heading or anchor "the-shape"/);
});

test("a heading's inline code is part of its anchor, and an underscore survives", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [it](#finding-3--w19-cannot-report-auth_required-today).\n\n### Finding 3 — W19 cannot report `auth_required` today\n"
  }), []);
});

test("punctuation is dropped rather than turned into a hyphen", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [it](#d6-the-floor-is-calibrated).\n\n### D6. The floor is calibrated\n"
  }), []);
});

test("a repeated heading takes the -1 suffix GitHub gives it", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [second](#outcome-1).\n\n## Outcome\n\n## Outcome\n"
  }), []);
});

test("an explicit HTML anchor counts", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": 'See [it](#pinned).\n\n<a id="pinned"></a>\n'
  }), []);
});

test("a fragment on a non-Markdown target is not checked", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "See [the call site](../../scripts/run.mjs#L20).",
    "scripts/run.mjs": "export const run = 1;"
  }), []);
});

// --- Code and comments are not prose ---

test("a link-shaped regex inside a code span is not a link", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "The pattern `[a-z0-9]([a-z0-9._-]{0,62})` names a label."
  }), []);
});

test("a link inside a fenced block is not a link", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "Example:\n\n```md\n[gone](./gone.md)\n```\n"
  }), []);
});

test("a blank line does not end a fence", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "```md\nfirst\n\n[gone](./gone.md)\n```\n"
  }), []);
});

test("a fence opened with tildes is not closed by backticks", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "~~~md\n```\n[gone](./gone.md)\n~~~\n"
  }), []);
});

test("a link in an HTML comment is not a link", () => {
  assert.deepEqual(messagesFor({
    "docs/architecture/a.md": "<!-- [gone](./gone.md) -->\n"
  }), []);
});

test("a real link after a fenced block is still checked", () => {
  const messages = messagesFor({
    "docs/architecture/a.md": "```md\n[example](./example.md)\n```\n\nSee [gone](./gone.md).\n"
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /docs\/architecture\/a\.md:5: the link to \.\/gone\.md is broken/);
});

// --- Scope and finding shape ---

test("only the configured directories are read", () => {
  const files = {
    "docs/architecture/a.md": "See [gone](./gone.md).",
    "docs/working/b.md": "See [gone](./gone.md)."
  };
  assert.equal(findingsFor(files, ["docs/architecture"]).length, 1);
  assert.equal(findingsFor(files, ["docs"]).length, 2);
  assert.equal(findingsFor(files, []).length, 0);
});

test("a finding names its file, keys on the file and target, and does not ratchet", () => {
  const [finding] = findingsFor({ "docs/architecture/a.md": "\n\nSee [gone](./gone.md)." });
  assert.equal(finding.path, "docs/architecture/a.md");
  assert.equal(finding.line, 3);
  assert.equal(finding.key, "docs/architecture/a.md::./gone.md");
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
});
