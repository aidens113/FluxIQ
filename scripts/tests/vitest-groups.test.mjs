import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVitestGroupsArgs, runVitestGroups } from "../vitest-groups.mjs";

function recorder(codes) {
  const calls = [];
  const run = async (call) => {
    calls.push(call);
    return codes[calls.length - 1] ?? 0;
  };
  return { calls, run };
}

test("runs every group in order, each with its own FLUXIQ_TEST_GROUP and the forwarded arguments", async () => {
  const { calls, run } = recorder([0, 0]);
  const code = await runVitestGroups({ groups: ["parallel", "real-sql"], args: ["src/a", "-t", "x"], cwd: "/pkg", env: { KEEP: "1" }, run, log: () => {} });
  assert.equal(code, 0);
  assert.deepEqual(calls.map((call) => call.env.FLUXIQ_TEST_GROUP), ["parallel", "real-sql"]);
  for (const call of calls) {
    assert.deepEqual(call.args, ["run", "--passWithNoTests", "src/a", "-t", "x"]);
    assert.equal(call.cwd, "/pkg");
    assert.equal(call.env.KEEP, "1");
  }
});

test("still runs the later groups after one fails, and fails the whole run", async () => {
  const { calls, run } = recorder([1, 0]);
  const lines = [];
  const code = await runVitestGroups({ groups: ["parallel", "real-sql"], run, log: (line) => lines.push(line) });
  assert.equal(code, 1);
  assert.equal(calls.length, 2);
  assert.match(lines.at(-1), /failed: parallel \(exit 1\)/u);
});

test("fails when only a later group fails", async () => {
  const { run } = recorder([0, 2]);
  assert.equal(await runVitestGroups({ groups: ["parallel", "real-sql"], run, log: () => {} }), 1);
});

test("refuses to run without a group", async () => {
  await assert.rejects(runVitestGroups({ groups: [], run: async () => 0, log: () => {} }), /name at least one group/u);
});

test("splits --groups out of the command line and drops pnpm's separator", () => {
  assert.deepEqual(parseVitestGroupsArgs(["--groups=parallel,real-sql", "--", "src/x.test.ts", "--reporter=dot"]), {
    groups: ["parallel", "real-sql"],
    args: ["src/x.test.ts", "--reporter=dot"]
  });
});
