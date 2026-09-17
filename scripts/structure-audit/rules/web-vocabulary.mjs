// Framework source stays neutral about the web domain.
//
// Why. FluxIQ Core is the framework every domain builds on; the downstream
// web-automation repository is one of them, and its vocabulary is not Core's.
// A web word that reaches a Core contract becomes a field every other domain
// carries and every reader has to interpret. The near miss that produced this
// rule: the browser extension added "which record a control sat in", and Core's
// element-target normaliser would have had to learn a web-specific key for it
// to survive a round trip. The right answer already existed -- Core's generic
// `entityId` / `entityKind` -- and the wrong one would have compiled, passed
// every test, and shipped. `imports` refuses a Core file that imports the
// downstream repository; nothing refused the concept arriving by hand.
//
// What is counted, in the source under `CONFIG.domainNeutralPaths` (test files
// and anything under a test root directory are skipped): a name this source
// declares or reads whose own words state a web or DOM concept.
//
//   type Target = { tabId: string };        a property signature's name
//   { tagName: element.tagName }            a property assignment, a read
//   const cssSelector = ...                 a variable, parameter or function
//   value["xpath"]                          an element access by string key
//   { "class-name": value }                 a string property key
//
// A name is split into words the way it is spelled -- `querySelector` into
// `query selector`, `DOMException` into `dom exception`, `set_active_tab` into
// `set active tab` -- and a term matches when its words appear as a run inside
// that list, a trailing "s" or "es" aside. So `selector` matches
// `querySelector` and `selectors` but not `select`; `dom` never matches
// `domain`, which splits to one word.
//
// What is not counted, and how each is told apart.
//
//   1. Documentation. Only script files are parsed, so no Markdown is ever
//      read, and a comment inside a source file is trivia the walk never
//      visits. A file may explain the web domain at any length.
//
//   2. A test that describes a downstream domain. `foo.test.ts`, and every
//      file under a `tests/` or `e2e/` root, is skipped outright. Core's tests
//      have to be able to say "a recorded click on a selector" to prove Core
//      carries one opaquely.
//
//   3. A string that quotes a domain's own vocabulary. A string literal is
//      counted only where it is a property key -- `value["xpath"]`,
//      `{ "tagName": x }` -- because that is a property read or declaration
//      spelled differently and would otherwise be a one-character bypass.
//      Every other string is data: a message, an error code, a prompt, a
//      regular expression, an element of a key list. Core may name the web's
//      keys in a set it passes through without ever learning one.
//
// The terms, and why each is in or out. Every term was chosen against Core's
// current source, not from a list of web words. A term is in when Core's own
// established vocabulary does not already own it; a word Core owns is out,
// because flagging it would bill Core's own abstraction as a leak and teach
// every reader to skip this rule's output.
//
//   In:  dom, css, selector, query selector, xpath, iframe, cookie, browser,
//        tab, click, scroll, inner html, outer html, tag name, class name,
//        aria, shadow root, user agent.
//
//        `selector` and `xpath` are the opaque locator Core carries by
//        decision (Phase T), and they are baselined rather than exempted, so
//        removing one lowers the bar permanently. `tab` already catches a real
//        leak -- `server.set_active_tab` carries a browser `tabId` through
//        Core's public gateway contract. `aria` catches `ariaLabel` where Core
//        already has the neutral `accessibleName`. `css`, `iframe`, `cookie`,
//        `click`, `scroll`, `inner html`, `outer html`, `shadow root` and
//        `user agent` cost nothing today: Core's framework source names none
//        of them.
//
//        `selector` is the one term that must be the whole name. In English a
//        selector is anything that selects, and Core's run service holds a
//        `reusableLlmContextFreshEvidenceSelector` -- a callback, correctly
//        named, nothing to do with CSS. Counting it would bill a correct name
//        as a leak in the most-edited file in the repository, which is how a
//        rule gets ignored. The cost is the stated hole below: a web locator
//        hidden inside a longer name is not caught. `query selector` is listed
//        separately because that spelling is never anything else.
//
//   Out: `viewport` -- Core's Flow-graph editor API owns it as the canvas
//        window over a graph (`GraphViewportRequest`, `getGraphViewport`),
//        across ten files. `hover`, `focus`, `dropdown` -- Core ships a UI
//        token contract that names interaction states of its own interface,
//        and a design system grows those. `element`, `frame` -- Core's state
//        model deliberately names the generic unit of a captured interface an
//        element in a visual frame, and that abstraction is the neutral one a
//        domain maps onto. `html`, `href`, `attribute` -- Core's docs program
//        renders HTML by design, so these are its output format. `document`,
//        `window` -- `FlowDocument` and `MiningWindow` are Core's. `url`,
//        `web`, `http` -- addressing and Core's own transport. `screenshot` --
//        visual evidence any UI domain produces. `keyboard`, `mouse`,
//        `button` -- input devices and widget kinds, not the web.
//
// One name is exempt: `DOMException`. It is the platform's own error type, the
// abort reason `AbortSignal` carries, and Core raises one wherever it cancels
// work -- four files today and more tomorrow. It is not a web-automation
// concept, so it will never be removed to lower a bar, which is what
// baselining it would promise; and a ratcheted entry has no room for a fifth
// file, so baselining it would hard-block correct work in a file that does not
// exist yet. That is the whole of the exemption, and it is the reason a
// deliberate web carry like `selector` is baselined instead: those can shrink.
//
// The holes, stated rather than hidden. The audit reads names, so it does not
// see a web concept carried under a neutral name (`queryPath` holding a CSS
// selector), a web locator hidden inside a longer name (`targetSelector`), a
// web API reached through a variable, or a web word spelled in a language it
// cannot split. It does not read comments, which is deliberate. Existing
// instances are baselined per file and may only shrink.

export const id = "web-vocabulary";
export const title = "Framework source stays neutral about the web domain";

// Terms matched anywhere inside a name. One or more words, and a term of
// several words matches only when they appear consecutively, so `tag name`
// matches `tagName` and never a lone `tag`. Two spellings are listed where the
// camel split differs: `xpath` and `XPath` divide differently, as do `iframe`
// and `iFrame`.
const TERMS = [
  "dom", "css", "query selector", "xpath", "x path", "iframe", "i frame", "cookie", "browser", "tab",
  "click", "scroll", "inner html", "outer html", "tag name", "class name", "aria", "shadow root", "user agent"
].map((term) => term.split(" "));

// Terms that count only as the whole name, because the word means something
// else inside a longer one. See the header for why `selector` is here.
const WHOLE_NAME_TERMS = ["selector"].map((term) => term.split(" "));

// The one name never counted: the platform's error type, not the document
// object model. The header says why this is an exemption and not a baseline.
const PLATFORM_NAMES = new Set(["DOMException"]);

// The words a name is spelled with: camel and acronym boundaries become
// breaks, as does any character that is not a letter or a digit.
function wordsOf(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .flatMap((part) => (part ? [part.toLowerCase()] : []));
}

const sameWord = (word, term) => word === term || word === `${term}s` || word === `${term}es`;

const runAt = (words, term, index) => term.every((word, offset) => sameWord(words[index + offset], word));

function termsIn(name) {
  if (PLATFORM_NAMES.has(name)) return [];
  const words = wordsOf(name);
  const found = [];
  for (const term of TERMS) {
    for (let index = 0; index + term.length <= words.length; index += 1) {
      if (runAt(words, term, index)) {
        found.push(term.join(" "));
        break;
      }
    }
  }
  for (const term of WHOLE_NAME_TERMS) if (words.length === term.length && runAt(words, term, 0)) found.push(term.join(" "));
  return found;
}

// A string literal is a name only where it is a property key: the one place a
// string declares or reads a member rather than carrying data.
function isPropertyKey(ts, node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isElementAccessExpression(parent)) return parent.argumentExpression === node;
  const declaresMember = ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent)
    || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isEnumMember(parent);
  return declaresMember && parent.name === node;
}

function nameOf(ts, node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  return ts.isStringLiteralLike(node) && isPropertyKey(ts, node) ? node.text : undefined;
}

function offences(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const found = [];
  const visit = (node) => {
    const name = nameOf(ts, node);
    const terms = name ? termsIn(name) : [];
    if (terms.length > 0) found.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, terms });
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found.sort((a, b) => a.line - b.line);
}

// The audited source: the configured neutral paths, minus tests. The filter is
// written here rather than borrowed from ../failure-handling/, which is named
// for a different concern.
function auditedFiles(ctx) {
  const prefixes = (ctx.CONFIG.domainNeutralPaths ?? []).map((prefix) => `${prefix}/`);
  if (prefixes.length === 0) return [];
  const roots = new Set(ctx.CONFIG.testRootDirNames ?? []);
  return ctx.scriptFiles
    .map((file) => ctx.normalize(file))
    .filter((file) => prefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => !ctx.isTestFile(file) && !file.split("/").slice(0, -1).some((segment) => roots.has(segment)));
}

// Each term once, at the first line that states it.
function firstLines(found) {
  const byTerm = new Map();
  for (const hit of found) for (const term of hit.terms) if (!byTerm.has(term)) byTerm.set(term, hit.line);
  return [...byTerm.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([term, line]) => `"${term}" at line ${line}`)
    .join(", ");
}

export function run(ctx) {
  const findings = [];
  for (const file of auditedFiles(ctx)) {
    const found = offences(ctx, file);
    if (found.length === 0) continue;

    const subject = found.length === 1
      ? `1 name states a web-domain concept: ${firstLines(found)}`
      : `${found.length} names state web-domain concepts: ${firstLines(found)}`;
    findings.push({
      rule: id,
      key: file,
      value: found.length,
      limit: 0,
      path: file,
      line: found[0].line,
      message: `${file}: ${subject}. FluxIQ Core is the framework every domain builds on, so a name out of one domain's vocabulary -- the DOM, CSS, a browser tab -- becomes a field every other domain carries. Use the neutral name Core already has: an element's identity is \`entityId\` and \`entityKind\`, its address is \`queryPath\` or \`statePath\`. What has no neutral equivalent belongs in the downstream domain repository, or inside an opaque handle Core stores and returns without reading. A comment, a test, or a string that is not a property key may say anything; it is the name Core declares or reads that this rule counts. Where Core must carry the web's own spelling, the instance is recorded in the structure baseline as a deliberate exception, and the recorded count may only fall.`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
