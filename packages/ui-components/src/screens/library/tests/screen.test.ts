import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { withFakeDocument } from "../../../testing/index.ts";
import { LIBRARY_EMPTY } from "../index.ts";
import { buttons, has, openLibrary, press, pressable, root, said, settle, submit, type, watchFocus } from "./screen-fixture.ts";

/** No code, id, hash or version reaches a person, on any screen. */
const noMachineWords = (words: string): void => assert.ok(!/part\.|parts\.|restock-notebooks|add-to-basket|choose-colour|list-loans|digest|hash|shapeHash|version/iu.test(words), words);

const loaded = async () => {
  const library = openLibrary();
  library.screen.render("project-1");
  library.screen.setActive(true);
  await settle();
  return library;
};

describe("the list", () => {
  test("shows the tree by site with a plain state and a count on each row, in words a person can read", () =>
    withFakeDocument(async () => {
      const { screen } = await loaded();
      const words = said(screen);
      assert.match(words, /harbour-library\.example3?1 subflow/u);
      assert.match(words, /paperworks\.example3 subflows/u);
      assert.match(words, /Order notebooks againWorks reliably · uses 2 subflows/u);
      assert.match(words, /Add an item to the basketWorked once · uses 1 subflowLast failed 1 Nov/u);
      assert.match(words, /Read my borrowed booksNot proven yet/u);
      noMachineWords(words);
    }));

  test("says what the library is, in one sentence, when there is nothing in it", () =>
    withFakeDocument(async () => {
      const { screen } = await (async () => {
        const library = openLibrary({ cards: [] });
        library.screen.render("project-1");
        library.screen.setActive(true);
        await settle();
        return library;
      })();
      assert.equal(said(screen), LIBRARY_EMPTY);
    }));

  test("reads nothing until it is active, and stops reading when it is not", () =>
    withFakeDocument(async () => {
      const { screen, port } = openLibrary();
      screen.render("project-1");
      await settle();
      assert.equal(port.calls.length, 0);
      screen.setActive(true);
      await settle();
      assert.equal(port.calls.length, 1);
      screen.setActive(false);
      screen.render("project-2");
      screen.setActive(false);
      await settle();
      assert.equal(port.calls.length, 1);
    }));

  test("a failed read is quiet, says so in words, offers Try again and keeps what was on screen", () =>
    withFakeDocument(async () => {
      const { screen, port } = await loaded();
      port.failNext("list", { ok: false, sentence: "FluxIQ is not reachable." });
      screen.setActive(true);
      await settle();
      assert.match(said(screen), /Could not read your subflows\. FluxIQ is not reachable\. Try again/u);
      assert.match(said(screen), /Order notebooks again/u, "the tree is still there");
      press(screen, "Try again");
      await settle();
      assert.ok(!said(screen).includes("Could not read"));
    }));

  test("a failed first read says so and does not look empty", () =>
    withFakeDocument(async () => {
      const { screen, port } = openLibrary();
      port.refuseNext("list", { code: "parts.unavailable" });
      screen.render("project-1");
      screen.setActive(true);
      await settle();
      assert.match(said(screen), /Your subflows cannot be read right now\. Try again/u);
      assert.ok(!said(screen).includes(LIBRARY_EMPTY));
    }));

  test("search keeps the path to each match, counts matches for the tab, and clears", () =>
    withFakeDocument(async () => {
      const { screen } = openLibrary();
      const counts: Array<number | null> = [];
      screen.onMatches((count) => counts.push(count));
      screen.render("project-1");
      screen.setActive(true);
      counts.length = 0;
      screen.search("colour");
      assert.deepEqual(counts, [], "nothing is counted before anything is read");
      await settle();
      assert.deepEqual(counts, [1]);
      const words = said(screen);
      assert.match(words, /Order notebooks again/u);
      assert.match(words, /Pick the paper colour/u);
      assert.ok(!words.includes("Read my borrowed books"));
      screen.search("zzz");
      assert.match(said(screen), /No subflow matches “zzz”\./u);
      screen.search("");
      assert.deepEqual(counts, [1, 0, null]);
      assert.match(said(screen), /Read my borrowed books/u);
    }));
});

describe("the details", () => {
  test("say what it does and needs, what is always used, and what must be true, and fill in the steps and who uses it", () =>
    withFakeDocument(async () => {
      const { screen } = await loaded();
      press(screen, "Pick the paper colour");
      const early = said(screen);
      assert.match(early, /Always uses: Sea green/u);
      assert.match(early, /Reading the steps\.\.\./u);
      await settle();
      const words = said(screen);
      assert.match(words, /Steps, in order/u);
      assert.match(words, /Choose the colour \(can change existing things\)/u);
      assert.match(words, /What must be true to start.*It has to start from the right page\./u);
      assert.match(words, /What it can do on the site.*Can change existing things/u);
      assert.match(words, /Who uses it.*Add an item to the basket/u);
      noMachineWords(words);
    }));

  test("show an automation as a user, a failure with its day, and how it has gone", () =>
    withFakeDocument(async () => {
      const { screen } = await loaded();
      press(screen, "Order notebooks again");
      await settle();
      assert.match(said(screen), /1 automation uses it\./u);
      assert.match(said(screen), /What must be true to start.*signed in and on your order history page\./u);
      assert.match(said(screen), /Worked 2 times when it was checked\./u);
      press(screen, "‹ Back");
      press(screen, "Add an item to the basket");
      assert.match(said(screen), /Worked once · Last failed 1 Nov/u);
      await settle();
      assert.match(said(screen), /Failed once\. Last failed 1 Nov\./u);
    }));

  test("open what it calls, nested, and Back or Escape returns with focus on the row that opened it", () =>
    withFakeDocument(async () => {
      const focus = watchFocus();
      try {
        const { screen } = await loaded();
        const row = pressable(screen, "Order notebooks again");
        press(screen, "Order notebooks again");
        await settle();
        press(screen, "Add an item to the basket");
        assert.match(said(screen), /Puts one item in the basket/u);
        await settle();
        press(screen, "Pick the paper colour");
        assert.match(said(screen), /Chooses the paper colour/u);
        root(screen).dispatch("keydown", { key: "Escape", preventDefault() {}, stopPropagation() {} });
        assert.match(said(screen), /Puts one item in the basket/u);
        press(screen, "‹ Back");
        assert.match(said(screen), /Orders more of a notebook/u);
        press(screen, "‹ Back");
        assert.match(said(screen), /paperworks\.example/u);
        assert.equal(focus.last()?.textContent.startsWith("Order notebooks again"), true, "focus is back on the row");
        assert.notEqual(focus.last(), row, "a new row of the same name, since the list was drawn again");
      } finally {
        focus.stop();
      }
    }));

  test("a failed read of the steps is quiet and keeps what is shown, with Try again", () =>
    withFakeDocument(async () => {
      const { screen, port } = await loaded();
      port.failNext("read", { ok: false, sentence: "FluxIQ is not reachable." });
      press(screen, "Pick the paper colour");
      await settle();
      assert.match(said(screen), /Could not read the steps\. FluxIQ is not reachable\. Try again/u);
      assert.match(said(screen), /Always uses: Sea green/u);
      press(screen, "Try again");
      await settle();
      assert.match(said(screen), /Open the colour list/u);
    }));

  test("Ask about it hands the host a sentence about the subflow", () =>
    withFakeDocument(async () => {
      const { screen, asked } = await loaded();
      press(screen, "Read my borrowed books");
      press(screen, "Ask about it");
      assert.deepEqual(asked, ["About my “Read my borrowed books” subflow: "]);
    }));

  test("Escape at the list does nothing", () =>
    withFakeDocument(async () => {
      const { screen } = await loaded();
      let prevented = false;
      root(screen).dispatch("keydown", { key: "Escape", preventDefault: () => (prevented = true) });
      assert.equal(prevented, false);
    }));
});

describe("running", () => {
  const openRun = async (name: string) => {
    const library = await loaded();
    press(library.screen, name);
    await settle();
    press(library.screen, "Run");
    return library;
  };

  test("a form with real labels says what is required, and a missing value is not sent", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Order notebooks again");
      assert.match(said(screen), /How many \(required\)/u);
      assert.match(said(screen), /Delivery note \(optional\)/u);
      assert.match(said(screen), /Running it can spend money and create new things\./u);
      submit(screen);
      await settle();
      assert.match(said(screen), /Fill this in to run it\./u);
      assert.equal(port.calls.filter((call) => call.method === "run").length, 0);
    }));

  test("a lasting act is asked once in one press, never a PIN, and the run goes on with it allowed", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Order notebooks again");
      type(screen, "How many", "2");
      submit(screen);
      await settle();
      assert.match(said(screen), /It would spend money and create new things, which needs your permission first\. Nothing on the site changed\./u);
      assert.ok(!/pin/iu.test(said(screen)));
      press(screen, "Allow it to spend money and create new things this once");
      await settle();
      const runs = port.calls.filter((call) => call.method === "run").map((call) => call.query);
      assert.deepEqual(runs, [
        { projectId: "project-1", partId: "restock-notebooks", version: 2, inputs: { quantity: "2" }, permitted: [], acknowledgedRepeat: false },
        { projectId: "project-1", partId: "restock-notebooks", version: 2, inputs: { quantity: "2" }, permitted: ["move_money", "create_new"], acknowledgedRepeat: false }
      ]);
      const words = said(screen);
      assert.match(words, /It finished\./u);
      assert.match(words, /Order number: A-4821/u);
      assert.match(words, /On the site it spent money and created new things\./u);
      assert.match(words, /FluxIQ has not checked this result\./u);
      assert.ok(!/[✓✔]|succeeded|failed/iu.test(words), "no tick, and no failed ending");
      assert.ok(has(screen, "Try again") && has(screen, "Ask about it"));
      noMachineWords(words);
    }));

  test("a repeat is said plainly and asked once", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Read my borrowed books");
      port.refuseNext("run", { code: "part.confirm_repeat", classes: ["create_new"] });
      submit(screen);
      await settle();
      assert.match(said(screen), /It would do its acts again: create new things\./u);
      press(screen, "Go ahead");
      await settle();
      const last = port.calls.filter((call) => call.method === "run").at(-1)!.query as { acknowledgedRepeat: boolean };
      assert.equal(last.acknowledgedRepeat, true);
      assert.match(said(screen), /It finished and saved 3 rows\./u);
      assert.match(said(screen), /Titles: Salt Roads/u);
    }));

  test("a repeat refused again after Go ahead is not offered again", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Read my borrowed books");
      port.refuseNext("run", { code: "part.confirm_repeat" });
      submit(screen);
      await settle();
      port.refuseNext("run", { code: "part.confirm_repeat" });
      press(screen, "Go ahead");
      await settle();
      assert.equal(has(screen, "Go ahead"), false);
      assert.equal(has(screen, "Try again"), true);
    }));

  test("a run that stops says where, never as a failed ending, and offers Try again and Ask about it", () =>
    withFakeDocument(async () => {
      const { screen, port, asked } = await openRun("Read my borrowed books");
      port.stopNext({ stepLabel: "Apply filter", reason: "The list never loaded." });
      submit(screen);
      await settle();
      assert.match(said(screen), /It stopped at Apply filter: The list never loaded\./u);
      assert.ok(!/fail|error/iu.test(said(screen)));
      press(screen, "Ask about it");
      assert.match(asked[0] ?? "", /Read my borrowed books/u);
      assert.match(asked[0] ?? "", /stopped at Apply filter/u);
      press(screen, "Try again");
      assert.match(said(screen), /Branch \(optional\)/u);
    }));

  test("each refusal is told in words with its next step", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Read my borrowed books");
      const cases: Array<[Parameters<typeof port.refuseNext>[1]["code"], RegExp]> = [
        ["part.wrong_site", /Open harbour-library\.example in this browser and try again\./u],
        ["part.not_at_start", /Go to the page it starts from and try again\./u],
        ["part.input_unknown", /a value it does not take/u],
        ["part.calls_not_available", /A smaller subflow it uses is no longer saved\./u],
        ["part.repeat_refused", /cannot safely be done twice/u],
        ["parts.unavailable", /cannot be read right now/u],
        ["part.not_found", /no longer saved/u],
        ["parts.run_id_refused", /could not be started/u]
      ];
      for (const [code, words] of cases) {
        port.refuseNext("run", { code });
        submit(screen);
        await settle();
        assert.match(said(screen), words, code);
        noMachineWords(said(screen));
        press(screen, "Try again");
      }
    }));

  test("while it runs the button says so and cannot be pressed twice", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Read my borrowed books");
      const release = port.holdNextRun();
      submit(screen);
      submit(screen);
      await settle();
      assert.equal(port.calls.filter((call) => call.method === "run").length, 1);
      const go = pressable(screen, "Running...");
      assert.equal(go.disabled, true);
      release();
      await settle();
      assert.match(said(screen), /It finished/u);
    }));

  test("a run that could not be reached says it is not known whether it ran, and offers Try again", () =>
    withFakeDocument(async () => {
      const { screen, port } = await openRun("Read my borrowed books");
      port.failNext("run", { ok: false, sentence: "FluxIQ is not reachable." });
      submit(screen);
      await settle();
      assert.match(said(screen), /could not be reached, so it is not known whether this ran.FluxIQ is not reachable\. Look at the site/u);
      assert.ok(has(screen, "Try again"));
      assert.equal(buttons(screen).some((button) => button.textContent.startsWith("Allow")), false);
    }));
});
