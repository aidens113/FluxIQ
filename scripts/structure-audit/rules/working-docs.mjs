// Working documents in docs/working/ are the repository's durable agent
// memory, so their headers must be machine-readable: an H1, a blank line, then
// eight fields in a fixed order, one per line. This rule holds that shape,
// requires an up-front `## Current State` while a document is Active, flags
// documents past the compaction threshold, and owns the generated index at
// docs/working/README.md -- run() proves the checked-in index still matches
// the documents' headers and update() (called only by --update) rewrites it.
//
// The header block and section order this enforces are specified in
// docs/working/agent-working-doc-protocol.md.

import { writeFileSync } from "node:fs";
import path from "node:path";

export const id = "working-docs";
export const title = "Working documents carry a conforming header, an up-front Current State, and a current index";

const FIELDS = ["Status", "Status detail", "Created", "Last updated", "Owner", "Scope", "Paired document", "Related"];
const STATUSES = ["Active", "Paused", "Blocked", "Complete", "Superseded", "Archived", "Unclassified"];
const GROUP_ORDER = ["Active", "Blocked", "Paused", "Complete", "Superseded", "Archived", "Unclassified"];

// H1 + blank line + the eight fields.
const HEADER_LINES = 2 + FIELDS.length;
// `## Current State` must appear within this many lines after the header.
const CURRENT_STATE_WINDOW = 20;
// The index reads header fields from this many lines after the H1, which
// tolerates a wrapped value that the header check reports separately.
const META_SCAN_LINES = 13;

const FIELD_PATTERN = new RegExp(`^(${FIELDS.join("|")}): ?(.*)$`);
const KEY_PATTERN = /^[A-Z][A-Za-z ]*: /;

const indexPath = (ctx) => `${ctx.CONFIG.workingDocsDir}/README.md`;

// Codepoint order, matching the Python reference generator's sorted().
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Split on LF and drop a trailing CR so that CRLF documents parse the same as
// LF ones. Two working documents in this repository still use CRLF.
const splitLines = (text) => text.split("\n").map((line) => line.replace(/\r$/, ""));

function workingDocs(ctx) {
  const dir = ctx.CONFIG.workingDocsDir;
  return ctx.trackedFiles
    .filter((file) => file.startsWith(`${dir}/`)
      && file.endsWith(".md")
      && !file.slice(dir.length + 1).includes("/")
      && ctx.basename(file) !== "README.md")
    .sort(byName);
}

function headerMeta(lines) {
  const meta = new Map();
  for (const line of lines.slice(1, 1 + META_SCAN_LINES)) {
    const match = FIELD_PATTERN.exec(line);
    if (match) meta.set(match[1], match[2].trim());
  }
  return meta;
}

function show(text) {
  if (text.trim() === "") return "a blank line";
  return `"${text.length > 60 ? `${text.slice(0, 60)}...` : text}"`;
}

function headerFinding(file, line, problem) {
  return {
    rule: id, key: file, value: 1, limit: 0, path: file, line,
    message: `${file}:${line}: ${problem} The header block is eight fields in a fixed order (${FIELDS.join(", ")}), one per line, directly after the H1 and one blank line; see the protocol's Header block section.`,
    severity: "fail", ratchet: false
  };
}

// Returns the first deviation from the header shape, or null. One finding per
// document: the block is parsed positionally, so once a line is wrong every
// line after it is reported against the wrong field and the rest is noise.
function checkHeader(file, lines) {
  const at = (index) => lines[index] ?? "";
  if (!at(0).startsWith("# ")) {
    return headerFinding(file, 1, `expected an H1 title line ("# ...") but found ${show(at(0))}.`);
  }
  if (at(1).trim() !== "") {
    return headerFinding(file, 2, `expected a blank line after the H1 but found ${show(at(1))}.`);
  }
  for (const [index, field] of FIELDS.entries()) {
    const line = 3 + index;
    const text = at(line - 1);
    if (!text.startsWith(`${field}: `)) {
      const wrapped = !KEY_PATTERN.test(text) && text.trim() !== ""
        ? " This looks like the previous field's value wrapped onto a second line; a value must fit on one line."
        : "";
      return headerFinding(file, line, `expected "${field}:" but found ${show(text)}.${wrapped}`);
    }
    const value = text.slice(field.length + 2).trim();
    if (value === "") {
      return headerFinding(file, line, `"${field}:" has no value.`);
    }
    if (field === "Status" && !STATUSES.includes(value)) {
      return headerFinding(file, line, `"Status:" must be one of ${STATUSES.join(", ")} but found "${value}".`);
    }
  }
  return null;
}

function checkCurrentState(file, lines, status) {
  if (status !== "Active") return null;
  const window = lines.slice(HEADER_LINES, HEADER_LINES + CURRENT_STATE_WINDOW);
  if (window.includes("## Current State")) return null;
  return {
    rule: id, key: file, value: 1, limit: 0, path: file, line: HEADER_LINES + 1,
    message: `${file}: Status is Active but there is no "## Current State" section directly after the header.`,
    severity: "fail", ratchet: false
  };
}

function checkSize(ctx, file) {
  const limit = ctx.LIMITS.workingDocLines;
  const lines = ctx.lineCount(file);
  if (lines <= limit) return null;
  const slug = ctx.basename(file).replace(/\.md$/, "");
  return {
    rule: id, key: file, value: lines, limit, path: file,
    message: `${file}: ${lines} lines exceeds the ${limit}-line compaction threshold. Compact it the next time work touches it: fold settled outcomes into Current State and move superseded detail to ${ctx.CONFIG.workingDocsDir}/${slug}/archive/.`,
    severity: "fail", ratchet: true
  };
}

// One row's worth of index data, derived only from the header block.
function indexEntry(ctx, file) {
  const meta = headerMeta(splitLines(ctx.read(file)));
  const status = meta.get("Status") ?? "Unclassified";
  const rawPaired = (meta.get("Paired document") ?? "none").replace(/^`+/, "").replace(/`+$/, "");
  return {
    name: ctx.basename(file),
    status: GROUP_ORDER.includes(status) ? status : "Unclassified",
    owner: meta.get("Owner") ?? "unassigned",
    lines: ctx.lineCount(file),
    scope: (meta.get("Scope") ?? "").replaceAll("|", "\\|"),
    paired: rawPaired === "none" ? "none" : rawPaired.replaceAll("\\", "/").split("/").at(-1)
  };
}

function generateIndex(ctx, docs) {
  const limit = ctx.LIMITS.workingDocLines;
  const entries = docs.map((file) => indexEntry(ctx, file));
  const ext = ctx.CONFIG.workingDocsIndexKind === "ext";
  const other = ext
    ? "Core's matching index is at `F:\\!FluxIQ\\docs\\working\\README.md`."
    : "The downstream web-extension index is at `F:\\!FluxIQWebExtension\\docs\\working\\README.md`.";
  const pairedHeader = ext ? "Paired in Core" : "Paired downstream";

  const out = [
    "# Working Document Index", "",
    "Every working document in this repository is listed here, grouped by the",
    "`Status` field of its header block. This index is derived from those headers",
    "and regenerated when a document is created, retired, or re-statused; edit the",
    "document's header, not this table. Read it first, pick the relevant document,",
    "then read that document's `Current State` section before anything else.", "",
    "Format, status vocabulary, ledger rules, worker briefs, and cross-repository",
    "pairing are defined in",
    "[Agent Working Document Protocol](./agent-working-doc-protocol.md).", "", other, ""
  ];

  for (const status of GROUP_ORDER) {
    const group = entries.filter((entry) => entry.status === status);
    if (group.length === 0) continue;
    out.push(`## ${status}`, "");
    if (status === "Superseded") {
      out.push("These no longer own current status; each names its successor in `Status",
        "detail`. Retained for evidence. Do not plan current work from them.", "");
    }
    out.push(`| Document | Owner | Lines | Scope | ${pairedHeader} |`, "| --- | --- | --- | --- | --- |");
    for (const entry of group) {
      const flag = entry.lines > limit ? " \u26a0" : "";
      const paired = entry.paired === "none" ? "none" : `\`${entry.paired}\``;
      out.push(`| [${entry.name}](./${entry.name}) | ${entry.owner} | ${entry.lines}${flag} | ${entry.scope} | ${paired} |`);
    }
    out.push("");
  }

  const oversized = entries.filter((entry) => entry.lines > limit).length;
  out.push(`\u26a0 marks documents over the ${limit}-line compaction threshold (${oversized} of ${entries.length} here).`,
    "Compact them the next time work touches them; do not schedule a bulk rewrite.", "");
  return out.join("\n");
}

export function run(ctx) {
  const docs = workingDocs(ctx);
  const findings = [];

  for (const file of docs) {
    const lines = splitLines(ctx.read(file));
    const header = checkHeader(file, lines);
    if (header) findings.push(header);
    const currentState = checkCurrentState(file, lines, headerMeta(lines).get("Status"));
    if (currentState) findings.push(currentState);
    const size = checkSize(ctx, file);
    if (size) findings.push(size);
  }

  const index = indexPath(ctx);
  const current = ctx.trackedFiles.includes(index) ? ctx.read(index) : null;
  if (current !== generateIndex(ctx, docs)) {
    findings.push({
      rule: id, key: index, value: 1, limit: 0, path: index,
      message: `${index} is out of date with the documents' header blocks. Run "pnpm structure:baseline" to regenerate it.`,
      severity: "fail", ratchet: false
    });
  }

  return findings;
}

// Called only by --update, after the baseline is written. This is the only
// write this rule performs, and docs/working/README.md is the only file it
// may write.
export function update(ctx) {
  const text = generateIndex(ctx, workingDocs(ctx));
  writeFileSync(path.join(ctx.repoRoot, indexPath(ctx)), text, "utf8");
}
