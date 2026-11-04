// The person-facing text guard (`../text-faults.ts`, t753): the strings round 5
// showed a person fault, each naming its token, and ordinary sentences --
// quoted names a site really uses among them -- pass.
import { describe, expect, it } from "vitest";
import { personFacingTextFaults } from "../index.ts";

const ROUND_5: ReadonlyArray<[string, string]> = [
  ["Reading the details of “css-0732x7m”", 'generated name "css-0732x7m"'],
  ["Whole-Flow trial could not be confirmed", 'internal term "trial"'],
  ["Saved candidate draft.", 'internal term "candidate"'],
  ["it saved 3 rows, but Core's own record shows they don't answer, so no judge was asked", 'internal term "Core"'],
  ["The check was judged to answer the request", 'internal term "judged"'],
  ["Build stopped. The Flow was not promoted.", 'internal term "promoted"'],
  ["Build failed | Build failed: FluxIQ could not finish the Flow: I could not finish this.", 'repeated phrase "build failed"']
];

const CLEAN: readonly string[] = [
  "Reading the details of “Save”",
  "Testing your Flow",
  "Step 2 of 5",
  "Opening “example.com”",
  "Opening “www.example.co.uk”",
  "Clicking “Clip 21.4K2”",
  "Paying with “Visa 4417”",
  "Choosing “iPhone 15 Pro” from the list on eBay",
  "Typing \"e-mail\" into “Wi-Fi settings”",
  "Looking up how to click and type",
  "Not done: clicking “Add to cart” — it was already tried exactly this way and changed nothing",
  "Saving the Flow's steps",
  "Testing the whole Flow from the start",
  "Build failed: it ran out of time",
  "Your Flow is ready",
  "Using “Submit subflow”",
  "Main: Runs each of the other subflows in turn, passing each value on by name",
  "The core idea is on the page",
  "Clicking “Promotions” on the shop page",
  "Reading the list of “Recent orders”, e.g. the first 20 rows",
  "Version 2.4 of the app is shown on the page",
  ""
];

describe("personFacingTextFaults", () => {
  it.each(ROUND_5)("faults round 5's %j", (text, fault) => {
    expect(personFacingTextFaults(text)).toContain(fault);
  });

  it.each(CLEAN)("passes the ordinary %j", (text) => {
    expect(personFacingTextFaults(text)).toEqual([]);
  });

  it("names internal terms as whole words in any case, once each", () => {
    expect(personFacingTextFaults("Router picked a Candidate; the candidate failed its TRIALS and the harness brief")).toEqual([
      'internal term "router"', 'internal term "candidate"', 'internal term "trials"', 'internal term "harness"', 'internal term "brief"'
    ]);
    expect(personFacingTextFaults("Subflowing and candidacy are not the words")).toEqual([]);
    expect(personFacingTextFaults("The Judge picked it: judging is done, it was promoted by Core")).toEqual([
      'internal term "judge"', 'internal term "judging"', 'internal term "promoted"', 'internal term "Core"'
    ]);
    expect(personFacingTextFaults("The Judge picked it: judging is done, it was promoted by Core")).toEqual([
      'internal term "judge"', 'internal term "judging"', 'internal term "promoted"', 'internal term "Core"'
    ]);
  });

  it("names code identifiers: dotted tool names, snake_case and camelCase", () => {
    expect(personFacingTextFaults("Ended on core.run_node")).toEqual(['code identifier "core.run_node"']);
    expect(personFacingTextFaults("Called project.write_plan then web.output.dom-click")).toEqual(['code identifier "project.write_plan"', 'code identifier "web.output.dom-click"']);
    expect(personFacingTextFaults("Read checkout_summary.")).toEqual(['code identifier "checkout_summary"']);
    expect(personFacingTextFaults("Left in routerRuns and taskSpec")).toEqual(['code identifier "routerRuns"', 'code identifier "taskSpec"']);
  });

  it("names generated class-like names, never a hyphenated word or a product code", () => {
    expect(personFacingTextFaults("Clicking “sc-AxjAm”")).toEqual(['generated name "sc-AxjAm"']);
    expect(personFacingTextFaults("Clicking “jsx-1234”")).toEqual(['generated name "jsx-1234"']);
    expect(personFacingTextFaults("Clicking “_a1b2c3”")).toEqual(['generated name "_a1b2c3"']);
    expect(personFacingTextFaults("Clicking “x-large” on the t-shirt")).toEqual([]);
  });

  it("names a run of three or more words said twice, never a repeat of filler words", () => {
    expect(personFacingTextFaults("Could not open the menu, so it could not open the menu")).toEqual(['repeated phrase "could not open the menu"']);
    expect(personFacingTextFaults("Moved one of the items to the top of the list and one of the others to the end")).toEqual([]);
  });
});
