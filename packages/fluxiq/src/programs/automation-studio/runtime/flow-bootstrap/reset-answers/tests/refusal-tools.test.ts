import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../../site-reset/index.ts";

// t751 R5, the refusal contract: every site-reset refusal some call can meet (`canMeet` `this_page` or `another_page`)
// tells the builder that call through a tool it is offered. Enforced by a scan of every source file of the four
// directories that build refusals (site-reset, reset-settlement, reset-answers, reset-admission), tests excluded: each
// `automationStudioSiteResetRefusal` call -- or each call of a local helper that hands it its instruction -- whose
// `canMeet` is not only `no_call` must build its instruction from the words (`AUTOMATION_STUDIO_SITE_RESET_WORDS`), and
// every words function it names must name an offered tool, for its literal arguments or, where they are not literal, for
// every sample of them. A refusal no call can meet is exempt: it tells the model to stop.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIRECTORIES = ["site-reset", "reset-settlement", "reset-answers", "reset-admission"];
/** The tools a builder is offered to meet a refusal with. */
const TOOLS = ["core.run_node", "core.test_subflow", "core.test_candidate", "core.submit_subflow"];
const MEETABLE = ["this_page", "another_page"];
/** Arguments tried for a words function whose arguments at the call site are not literal. */
const ISSUED = { ref: "destination-1", count: 2, location: "loc:list" };
const SAMPLES: unknown[][] = [[], [true], [false], [[]], [[ISSUED]], [[], []], [[ISSUED], [ISSUED]]];
type Words = Record<string, (...args: unknown[]) => string>;

/** Every source file of the four directories, tests excluded. */
function sources(directory: string): Array<{ path: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sources(full);
    return entry.name.endsWith(".ts") ? [{ path: full, text: readFileSync(full, "utf8") }] : [];
  });
}

/** `text` with its comments blanked, strings kept, so a call in a comment never counts. */
function code(text: string): string {
  let out = "";
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!, next = text[index + 1];
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      for (let blank = index; blank <= (end < 0 ? text.length : end + 1); blank += 1) out += text[blank] === "\n" ? "\n" : " ";
      index = end < 0 ? text.length : end + 1;
    } else {
      if (char === "\"" || char === "'" || char === "`") quote = char;
      out += char;
    }
  }
  return out;
}

/** The argument text of the call whose `(` is at `open`, up to its matching `)`. */
function argumentsAt(text: string, open: number): string {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")" && --depth === 0) return text.slice(open + 1, index);
  }
  return text.slice(open + 1);
}

/** Each call of `name` in `text`, never its own definition: its offset and its argument text. */
function callsOf(text: string, name: string): Array<{ at: number; args: string }> {
  return [...text.matchAll(new RegExp(`(?<![\\w.]|function\\s+)${name}\\(`, "gu"))].map((match) => ({ at: match.index ?? 0, args: argumentsAt(text, (match.index ?? 0) + name.length) }));
}

/** The name of the function a refusal call sits in, where it is a local helper: `function name(` or `const name = (`. */
function helperOf(text: string, at: number): string | undefined {
  const before = text.slice(0, at);
  const found = [...before.matchAll(/(?:function\s+(\w+)\s*[<(]|const\s+(\w+)\s*=\s*\()/gu)].at(-1);
  return found?.[1] ?? found?.[2];
}

/** The words functions an argument text names, with their argument text. */
function wordsIn(args: string): Array<{ name: string; args: string }> {
  return [...args.matchAll(/\bWORDS\.(\w+)\(/gu)].map((match) => ({ name: match[1]!, args: argumentsAt(args, (match.index ?? 0) + match[0].length - 1).trim() }));
}

/** What `name` says for its call-site arguments: literal ones exactly, any other for every sample. */
function said(name: string, args: string): string[] {
  const words = WORDS as unknown as Words;
  const literal = args === "" ? [[]] : args === "true" ? [[true]] : args === "false" ? [[false]] : undefined;
  return (literal ?? SAMPLES).flatMap((sample) => {
    try {
      return [words[name]!(...sample)];
    } catch {
      return [];
    }
  });
}

type Site = { file: string; line: number; canMeet: string[]; words: Array<{ name: string; args: string }> };

/** Every refusal site some call can meet, with the words its instruction is built from (header). */
function meetableSites(): Site[] {
  const sites: Site[] = [];
  for (const file of DIRECTORIES.flatMap((directory) => sources(join(ROOT, directory)))) {
    if (file.path.endsWith(join("reset-answers", "refusal.ts"))) continue;
    const text = code(file.text);
    const where = (at: number) => ({ file: relative(ROOT, file.path), line: text.slice(0, at).split("\n").length });
    for (const call of [...callsOf(text, "refusal"), ...callsOf(text, "automationStudioSiteResetRefusal")]) {
      const own = wordsIn(call.args);
      // A helper hands the constructor its instruction: each call of the helper is the site.
      const helper = own.length ? undefined : helperOf(text, call.at);
      const uses = own.length || !helper ? [call] : callsOf(text, helper);
      for (const use of uses) {
        const canMeet = [...use.args.matchAll(/"(this_page|another_page|no_call)"/gu)].map((match) => match[1]!);
        if (canMeet.length && canMeet.every((value) => value === "no_call")) continue;
        sites.push({ ...where(use.at), canMeet, words: own.length ? own : wordsIn(use.args) });
      }
    }
  }
  return sites;
}

describe("every refusal some call can meet names a tool the builder is offered (t751 R5)", () => {
  it("the scan finds the refusal sites it must, in each directory that builds them", () => {
    const sites = meetableSites();
    for (const file of ["site-reset/trial-policy.ts", "site-reset/undo-admission.ts", "site-reset/undo-claims.ts", "site-reset/ledger.ts", "site-reset/project-reset.ts", "site-reset/create-baselines.ts", "reset-admission/admission.ts"]) {
      expect(sites.some((site) => site.file.replaceAll("\\", "/") === file), file).toBe(true);
    }
    expect(sites.flatMap((site) => site.words.map((entry) => entry.name))).toEqual(expect.arrayContaining(["resetRequired", "unprovedUndo", "witnessRequired", "createBaselineRequired", "stepWitnessRequired", "alreadyBack", "destinationUnissued", "unknownAct", "unprovedReset", "startDiffers"]));
  });

  it("each such site builds its instruction from the words, and every words function it names names an offered tool", () => {
    const failures = meetableSites().flatMap((site) => {
      if (!site.words.length) return [`${site.file}:${site.line}: no words function builds this instruction`];
      return site.words.flatMap((entry) => {
        const texts = said(entry.name, entry.args);
        if (!texts.length) return [`${site.file}:${site.line}: WORDS.${entry.name}(${entry.args}) could not be said`];
        return texts.filter((text) => !TOOLS.some((tool) => text.includes(tool))).map((text) => `${site.file}:${site.line}: WORDS.${entry.name}(${entry.args}) names no offered tool: ${text.slice(0, 80)}...`);
      });
    });
    expect(failures).toEqual([]);
  });

  it("the meetable values are the ones the closed set names", () => {
    expect(MEETABLE.every((value) => meetableSites().some((site) => site.canMeet.includes(value)))).toBe(true);
  });
});
