// The comparison the instruction reads ground quotes with, and the same
// comparison with each compared unit's place in the person's original words.
//
// The permission read keeps its first-match comparison unchanged; the route
// read needs to say *where* in the instruction its words are, so it uses the
// mapped form. The mapped text must be the comparison text exactly, or the two
// reads would ground different words.
import { describe, expect, it } from "vitest";
import { automationStudioComparableInstructionText, automationStudioMappedInstructionText } from "../index.ts";

const CORPUS = [
  "Go to the Home page, open Friends, then Friend requests.",
  "  Leading and   trailing\twhitespace\n\n ",
  "Curly ‘single’ and “double” quotes",
  "Emoji 😀 before WORDS and 𝐁old after",
  "İstanbul has a dotted capital I",
  "Ends with several marks!!.;",
  "Line one\r\nLine two with a no-break space"
];

describe("the comparison the permission read has always used", () => {
  it("folds case, typographic quotes and spacing, and drops trailing sentence marks", () => {
    expect(automationStudioComparableInstructionText("  Go to the “Home”   page’s top.  ")).toBe("go to the \"home\" page's top");
    expect(automationStudioComparableInstructionText("Stop!!.;")).toBe("stop");
  });
});

describe("the mapped comparison", () => {
  it.each(CORPUS)("reproduces the comparison text exactly: %j", (text) => {
    expect(automationStudioMappedInstructionText(text)?.text).toBe(automationStudioComparableInstructionText(text));
  });

  it("maps a compared match back to the person's original words, in UTF-16 code units, half-open", () => {
    const text = "Emoji 😀 first, then Open   “Friends” page.";
    const mapped = automationStudioMappedInstructionText(text)!;
    const at = mapped.text.indexOf("open \"friends\"");
    const span = mapped.span(at, at + "open \"friends\"".length);
    expect(text.slice(span.start, span.end)).toBe("Open   “Friends”");
  });

  it("keeps a surrogate pair whole and counts it as two code units", () => {
    const text = "😀 Friends";
    const mapped = automationStudioMappedInstructionText(text)!;
    expect(mapped.span(0, 2)).toEqual({ start: 0, end: 2 });
    const at = mapped.text.indexOf("friends");
    expect(mapped.span(at, at + 7)).toEqual({ start: 3, end: 10 });
  });

  it("maps every unit a lowercasing expanded to the one original character", () => {
    const text = "İstanbul";
    const mapped = automationStudioMappedInstructionText(text)!;
    expect(mapped.text.length).toBeGreaterThan(text.length);
    const at = mapped.text.indexOf("stanbul");
    expect(text.slice(mapped.span(0, at).start, mapped.span(0, at).end)).toBe("İ");
    expect(text.slice(mapped.span(at, at + 7).start, mapped.span(at, at + 7).end)).toBe("stanbul");
  });

  it("answers nothing, rather than different words, where lowercasing depends on context", () => {
    // A final capital sigma lowercases to ς in a whole word but σ alone, so no per-character map can reproduce it.
    expect(automationStudioMappedInstructionText("ΟΔΟΣ")).toBeUndefined();
  });
});
