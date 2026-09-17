// Authored documentation's local links resolve, and the headings they point at
// still exist.
//
// Documentation is where the reason for a rule is written down, and a link is
// how one document hands the reader to that reason. A moved file or a renamed
// heading breaks the handover silently: the prose still reads correctly, and
// nothing fails, so the reason is simply lost. This rule is what makes that a
// build failure instead.
//
// What is checked, for every Markdown file the audit sees under a directory
// named in CONFIG.docsLinkDirs:
//
//   - a relative link resolves to a file the audit sees, or to a directory that
//     holds a README.md;
//   - a link may not escape the repository;
//   - a `#fragment` on a Markdown target names a heading in that file -- by the
//     GitHub slug, including its `-1`, `-2` suffixes for repeated headings --
//     or an explicit `id=`/`name=` anchor;
//   - a bare `#fragment` is checked against the file it appears in.
//
// Absolute URLs are skipped: the network is not the build's to check. Fenced
// code, inline code spans and HTML comments are blanked before matching, so a
// regex such as `[a-z](x)` in an example is not read as a link. Reference-style
// links (`[text][label]`) are not resolved; neither repository uses them.
//
// The scope is configured per repository and is expected to be clean, like
// CONFIG.contractSpreadPaths: the finding does not ratchet, so a directory is
// added to docsLinkDirs once its links resolve, and stays green afterwards
// because any new break fails on the commit that introduces it.
//
// This is the repository's only link checker. It replaced Core's standalone
// scripts/validate-docs.mjs, whose link-existence check it carries; it adds
// anchors, inline-code blanking, and running inside `pnpm check` in both
// repositories rather than only in a separate `pnpm docs:check` step. It reads
// the audited file set (ctx.files: tracked files plus untracked files git does
// not ignore) rather than the working tree, so a link into an ignored build
// artefact is a broken link -- which it is for anyone who clones -- while a new
// document, and a link to one, are checked before either is committed.

import path from "node:path";

export const id = "docs-links";
export const title = "Documentation's local links resolve, and their anchors name a real heading";

const MARKDOWN = /\.mdx?$/i;

// `[text](target)` and `![alt](target)`, with an optional title after the
// target, and an angle-bracketed target for a path containing spaces.
const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>\n]*>|[^()\s]*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;

// Any URL scheme (https:, mailto:, data:, tel:, vscode:). The network and the
// user's machine are not the build's to resolve.
const SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

const FENCE_MARKER = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)(?:[^`]|(?!\1)`)*\1/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
const HTML_ANCHOR = /<[a-z][^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;

export function run(ctx) {
  const docs = documents(ctx);
  const known = new Set(ctx.files);
  const directories = fileDirectories(ctx.files);
  const anchors = new Map();
  const findings = [];

  for (const file of docs) {
    const text = blankCode(ctx.read(file));
    for (const [rawTarget, index] of links(text)) {
      const problem = check(ctx, { file, rawTarget, known, directories, anchors });
      if (problem) findings.push(finding(file, rawTarget, lineOf(text, index), problem));
    }
  }
  return findings;
}

// The audited Markdown under the configured directories. A directory prefix
// matches the directory itself and everything below it.
function documents(ctx) {
  const dirs = ctx.CONFIG.docsLinkDirs ?? [];
  return ctx.files.filter((file) => MARKDOWN.test(file) && dirs.some((dir) => file === dir || file.startsWith(`${dir}/`)));
}

function fileDirectories(files) {
  const dirs = new Set();
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  return dirs;
}

// Returns the problem with `rawTarget`, or null when it resolves. The caller
// turns a problem into a finding; this returns a sentence that ends the message.
function check(ctx, { file, rawTarget, known, directories, anchors }) {
  const target = rawTarget.startsWith("<") && rawTarget.endsWith(">") ? rawTarget.slice(1, -1) : rawTarget;
  if (target === "" || SCHEME.test(target)) return null;

  const hash = target.indexOf("#");
  const beforeHash = hash === -1 ? target : target.slice(0, hash);
  const fragment = hash === -1 ? "" : target.slice(hash + 1);
  const withoutQuery = beforeHash.split("?", 1)[0] ?? "";

  let document = file;
  if (withoutQuery !== "") {
    let decoded;
    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      return "it is not valid URL encoding.";
    }
    const resolved = path.posix.normalize(path.posix.join(ctx.dirname(file), decoded)).replace(/\/$/, "");
    if (resolved === ".." || resolved.startsWith("../")) return "it points outside the repository.";
    if (known.has(resolved)) document = resolved;
    else if (directories.has(resolved)) {
      if (!known.has(`${resolved}/README.md`)) return `${resolved}/ is a directory with no README.md, so the link has nothing to open.`;
      document = `${resolved}/README.md`;
    } else return `no file git tracks or would add is at ${resolved}. Point it at where the file moved to, or remove the link.`;
  }

  if (fragment === "" || !MARKDOWN.test(document)) return null;
  let wanted;
  try {
    wanted = decodeURIComponent(fragment).toLowerCase();
  } catch {
    return "its fragment is not valid URL encoding.";
  }
  if (anchorsOf(ctx, document, anchors).has(wanted)) return null;
  const where = document === file ? "this document" : document;
  return `${where} has no heading or anchor "${wanted}". A heading's anchor is its text lowercased, with punctuation dropped and spaces turned into hyphens; rename the link to follow the heading, or restore the heading.`;
}

// Every anchor a reader can land on in `document`: one per ATX heading, by the
// GitHub slug, with the `-1`, `-2` suffixes GitHub gives repeated headings,
// plus any explicit HTML id or name.
//
// Only fences are blanked here, not inline code: a heading may name a symbol
// in backticks, and that symbol is part of its anchor, so slug() unwraps the
// backticks rather than the text arriving here without them.
function anchorsOf(ctx, document, cache) {
  const cached = cache.get(document);
  if (cached) return cached;
  const text = blankFences(ctx.read(document));
  const found = new Set();
  const seen = new Map();
  for (const match of text.matchAll(ATX_HEADING)) {
    const base = slug(match[2]);
    if (base === "") continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const match of ctx.read(document).matchAll(HTML_ANCHOR)) found.add(match[1].toLowerCase());
  cache.set(document, found);
  return found;
}

// GitHub's heading slug: inline markup removed, lowercased, everything but
// letters, numbers, marks, spaces, hyphens and underscores dropped, spaces
// turned into hyphens. An underscore survives -- `auth_required` in a heading
// anchors as auth_required -- so only `*` and `~` are stripped as emphasis.
function slug(heading) {
  return heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function* links(text) {
  for (const match of text.matchAll(LINK)) yield [match[1].trim(), match.index];
}

// Blanks fenced code, inline code spans and HTML comments, keeping every
// newline and every offset so that a finding still reports its own line. A
// documented regex is not a link, and neither is a commented-out one.
//
// Fences are scanned line by line rather than matched as one expression: a
// blank line inside a fence must not be read as the end of it, and an
// unterminated fence runs to the end of the file, as CommonMark says.
function blankCode(text) {
  return blankFences(text).replace(HTML_COMMENT, blank).replace(INLINE_CODE, blank);
}

function blankFences(text) {
  let fence = null;
  const lines = text.split("\n").map((line) => {
    const marker = FENCE_MARKER.exec(line)?.[1];
    if (fence === null) {
      if (marker === undefined) return line;
      fence = marker;
      return blank(line);
    }
    if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    return blank(line);
  });
  return lines.join("\n");
}

const blank = (match) => match.replace(/[^\n]/g, " ");

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

function finding(file, rawTarget, line, problem) {
  return {
    rule: id, key: `${file}::${rawTarget}`, value: 1, limit: 0, path: file, line,
    message: `${file}:${line}: the link to ${rawTarget} is broken: ${problem}`,
    severity: "fail", ratchet: false
  };
}
