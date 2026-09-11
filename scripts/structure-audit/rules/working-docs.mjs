// Working documents in docs/working/ are the repository's durable agent
// memory, so their headers must be machine-readable: an H1, a blank line, then
// eight fields in a fixed order, one per line. This rule holds that shape,
// requires an up-front `## Current State` while a document is Active, holds
// that section to a line budget because every agent reads it before every
// task, holds `## Work Ledger` entries to recording a real validation result
// rather than a repeated report, flags documents past the compaction
// threshold, and owns the generated index at docs/working/README.md -- run()
// proves the checked-in index still matches the documents' headers and
// update() (called only by --update) rewrites it.
//
// The header block and section order this enforces are specified in
// docs/working/agent-working-doc-protocol.md.

import { writeFileSync } from "node:fs";
import path from "node:path";

export const id = "working-docs";
export const title = "Working documents carry a conforming header, a short up-front Current State, a validated ledger, and a current index";

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

// A `## Work Ledger` entry records what it ran on a bullet starting with this.
const VALIDATION_BULLET = "- Validation:";
// Phrases that mean an agent took a report at its word. The protocol requires
// the Validation bullet to name what a command actually printed, because a
// completion report is not by itself evidence that anything ran.
const HEARSAY = /reported success|workers? (reported|said|claimed)\b/i;

const FIELD_PATTERN = new RegExp(`^(${FIELDS.join("|")}): ?(.*)$`);
const KEY_PATTERN = /^[A-Z][A-Za-z ]*: /;

const indexPath = (ctx) => `${ctx.CONFIG.workingDocsDir}/README.md`;

// Codepoint order, matching the Python reference generator's sorted().
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Split on LF and drop a trailing CR so that CRLF documents parse the same as
// LF ones. Two working documents in this repository still use CRLF.
const splitLines = (text) => text.split("\n").map((line) => line.replace(/\r$/, ""));

// `## ` with the trailing space, so an H3 (`### `) is not read as a new section.
const isSection = (line) => line.startsWith("## ");

// One `## <name>` section: its heading's 0-based index and the lines from that
// heading up to the next `## ` heading or the end of the document. Null when
// the document has no such section.
function section(lines, heading) {
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const offset = lines.slice(start + 1).findIndex(isSection);
  const end = offset === -1 ? lines.length : start + 1 + offset;
  return { start, lines: lines.slice(start, end) };
}

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

// Current State is the one section every agent reads before every task, so its
// length is paid over and over. Ratcheted: documents keep the size they have
// today but may not grow past it.
function checkCurrentStateLength(ctx, file, lines) {
  const found = section(lines, "## Current State");
  if (!found) return null;
  const limit = ctx.LIMITS.workingDocCurrentStateLines;
  const count = found.lines.length;
  if (count <= limit) return null;
  return {
    rule: id, key: `${file}#current-state`, value: count, limit, path: file, line: found.start + 1,
    message: `${file}: "## Current State" is ${count} lines, over the ${limit}-line budget. Every agent reads this section before every task, so keep only what the next one needs to act on and push the rest into the body or the archive.`,
    severity: "fail", ratchet: true
  };
}

// Splits a ledger section into its `### ` entries. Lines before the first
// entry (the heading itself, blank lines) belong to no entry and are dropped.
function ledgerEntries(sectionLines) {
  const entries = [];
  for (const line of sectionLines) {
    if (line.startsWith("### ")) entries.push({ title: line.slice(4).trim(), lines: [] });
    else entries.at(-1)?.lines.push(line);
  }
  return entries;
}

// The entry's Validation bullet joined with its wrapped continuation lines, so
// that a phrase split across a line break is still seen. A continuation is an
// indented non-blank line; the block ends at the next top-level bullet, a
// blank line, or the end of the entry. Null when the bullet is missing.
function validationText(entryLines) {
  const start = entryLines.findIndex((line) => line.startsWith(VALIDATION_BULLET));
  if (start === -1) return null;
  const block = [entryLines[start]];
  for (const line of entryLines.slice(start + 1)) {
    if (line.trim() === "" || !/^\s/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(" ");
}

// One finding per document rather than per entry: the ratchet counts against a
// single key, so a document may fix its ledger over time but never add drift.
function checkLedger(file, lines) {
  const ledger = section(lines, "## Work Ledger");
  if (!ledger) return null;

  const offenders = [];
  for (const entry of ledgerEntries(ledger.lines)) {
    const text = validationText(entry.lines);
    if (text === null) offenders.push(`"${entry.title}" (no "${VALIDATION_BULLET}" bullet)`);
    else if (HEARSAY.test(text)) offenders.push(`"${entry.title}" (Validation repeats a report instead of a result)`);
  }
  if (offenders.length === 0) return null;

  const subject = offenders.length === 1 ? "1 Work Ledger entry does" : `${offenders.length} Work Ledger entries do`;
  return {
    rule: id, key: `${file}#ledger`, value: offenders.length, limit: 0, path: file, line: ledger.start + 1,
    message: `${file}: ${subject} not record a validation result: ${offenders.join("; ")}. Every entry needs a "${VALIDATION_BULLET}" bullet naming the exact command and what it actually printed; a worker's own report is not a validation result. If nothing ran, write "not validated" and say why.`,
    severity: "fail", ratchet: true
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
    const currentStateLength = checkCurrentStateLength(ctx, file, lines);
    if (currentStateLength) findings.push(currentStateLength);
    const ledger = checkLedger(file, lines);
    if (ledger) findings.push(ledger);
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
