// The acceptance test: a sample program in a temporary directory defines a node, runs
// it against the fake engine, and receives typed outputs, a check round trip and a
// person_needed event. The program is its own file, as a developer would write it,
// and finds the engine and the key through the credential chain alone.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../cli/index.ts";
import { loadPrivateKeyFile } from "../keys/index.ts";
import { checkedListingsScenario } from "./fake-engine/checked-listings-scenario.ts";
import { startFakeEngine, type FakeEngine } from "./fake-engine/start-fake-engine.ts";

const PROGRAM = `
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

export const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) }),
  outputs: z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) }),
  scope: { sites: ["market.example"], acts: ["read"] },
  check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings",
  options: { retries: 3, judge: "auto", budgetUsd: 0.5, model: "claude-haiku-5-5" }
});

export async function main(env, cwd) {
  const fluxiq = await FluxIQ.connect({ env, cwd });
  const people = [];
  const eventTypes = [];
  const run = await fluxiq.run(cheapestListings, { query: "lens hood", country: "UK", count: 3 }, {
    onPersonNeeded: (event) => { people.push(event.reason); return "done"; },
    onEvent: (event) => eventTypes.push(event.type)
  });
  return { run, people, eventTypes };
}
`;

let root = "";
let engine: FakeEngine | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sdk-program-"));
});
afterEach(async () => {
  await engine?.close();
  engine = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("a sample program written against @fluxiq/sdk", () => {
  it("defines a node, runs it, and gets typed outputs, a check round trip and a person_needed event", async () => {
    const project = path.join(root, "project");
    mkdirSync(project);
    const env: NodeJS.ProcessEnv = { FLUXIQ_CONFIG_DIR: path.join(root, "home") };
    expect(await runCli(["init"], { out: () => undefined, err: () => undefined, env, cwd: project })).toBe(0);
    engine = await startFakeEngine({ scenario: checkedListingsScenario({ askPerson: true }), requireKey: true });
    engine.trust(loadPrivateKeyFile(path.join(root, "home", "keys", "owner.pem"), "test").publicKeySpki.toString("base64url"));
    env.FLUXIQ_ENDPOINT = engine.url;
    const file = path.join(project, "program.mjs");
    writeFileSync(file, PROGRAM);

    const program = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { main(env: NodeJS.ProcessEnv, cwd: string): Promise<{ run: { status: string; outputs: { listings: Array<{ title: string; price: number; url: string }> }; verdict: unknown; path: string }; people: string[]; eventTypes: string[] }> };
    const { run, people, eventTypes } = await program.main(env, project);

    expect(run.status).toBe("achieved");
    expect(run.outputs.listings).toEqual([
      { title: "Lens hood 1", price: 10, url: "https://market.example/item/1" },
      { title: "Lens hood 2", price: 11, url: "https://market.example/item/2" },
      { title: "Lens hood 3", price: 12, url: "https://market.example/item/3" }
    ]);
    expect(run.verdict).toEqual({ label: "confirmed", by: "check" });
    expect(people).toEqual(["Sign in to market.example to see prices."]);
    expect(eventTypes).toContain("person_needed");
    expect(eventTypes.filter((type) => type === "check_needed")).toHaveLength(2);
    expect(eventTypes.at(-1)).toBe("ended");
    const checkAnswers = engine.requests.filter((request) => request.path.endsWith("/answers")).map((request) => request.body);
    expect(checkAnswers).toContainEqual({ type: "person_answer", eventId: "person_1", outcome: "done" });
    expect(checkAnswers).toContainEqual({ type: "check_answer", eventId: "check_1", pass: false, reason: "wrong number of listings" });
    expect(checkAnswers).toContainEqual({ type: "check_answer", eventId: "check_2", pass: true });
    expect(engine.requests.some((request) => request.path === "/api/keys/session")).toBe(true);
  });
});
