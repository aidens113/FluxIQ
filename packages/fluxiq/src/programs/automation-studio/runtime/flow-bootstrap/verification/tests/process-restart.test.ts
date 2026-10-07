import { fork, type ChildProcess, type ForkOptions, type SpawnOptions } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Packet = { phase: string; code?: string; status?: string; ledgerStatus?: string; executionStatus?: string; verificationStatus?: string; receiptId?: string; runId?: string };
const built = path.resolve(fileURLToPath(new URL("../../../../../../../", import.meta.url)), "dist/programs/automation-studio");

// Test-only script imports built owners rather than a duplicate implementation.
function childScript(): string {
  const verification = pathToFileURL(path.join(built, "runtime/flow-bootstrap/verification/index.js")).href;
  const ledger = pathToFileURL(path.join(built, "storage/project/candidate-verification/index.js")).href;
  const project = pathToFileURL(path.join(built, "storage/project/index.js")).href;
  return `
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { AutomationStudioCandidateDurableSession, automationStudioCandidateRequirementsDigest } from ${JSON.stringify(verification)};
import { AutomationStudioCandidateVerificationStore } from ${JSON.stringify(ledger)};
import { AutomationStudioProjectDatabasePool } from ${JSON.stringify(project)};
const [root, mode] = process.argv.slice(2);
const send = packet => process.send?.(packet);
const park = () => new Promise(() => { setInterval(() => {}, 1000); });
try {
  const text = 'Ensure desired setting.';
  const brief = { interpretationStatus: 'complete', instructions: [{ instructionId: 'instruction.1', text }], requirements: [{ requirementId: 'requirement.1', source: { instructionId: 'instruction.1', start: 0, end: text.length }, mode: 'ensure', subjects: { kind: 'explicit', subjectIds: ['subject.1'] }, predicates: [{ kind: 'equals', field: 'setting', value: 'desired' }] }] };
  const request = { attemptId: 'attempt.1', brief, conditionsDigest: 'c'.repeat(64), binding: { candidateId: 'candidate.1', identity: { projectId: 'project.1', flowId: 'flow.1', revision: 1, digest: 'a'.repeat(64), baseDependencyDigest: 'b'.repeat(64), requirementsDigest: automationStudioCandidateRequirementsDigest(brief) }, baseSettingsRevision: 1, originalInstructionText: text, instructionSources: [{ instructionId: 'instruction.1', revision: 1, textDigest: createHash('sha256').update(text).digest('hex') }], permissionDigest: 'd'.repeat(64), registryDigest: 'e'.repeat(64), compilerVersion: 'compiler.v1', normalizerVersion: 'normalizer.v1', issuerVersion: 'observer.v1' } };
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: 'project.1' });
  if (mode === 'finish_crash') {
    const finish = store.finish.bind(store);
    store.finish = async (...args) => {
      await finish(...args);
      const saved = await store.get(request.attemptId);
      send({ phase: 'finish_committed', receiptId: saved.outcome.receipt.receiptId, runId: saved.outcome.receipt.runId });
      await park();
    };
  }
  const session = new AutomationStudioCandidateDurableSession({ request, store, currentBinding: async () => request.binding, ports: {
    prepareStart: async ({ conditionsDigest }) => {
      await appendFile(path.join(root, 'starts.txt'), 'start\\n');
      return { receiptId: 'start.1', conditionsDigest, preparedAt: 1, pageGeneration: 1, subjectStates: [{ observationId: 'baseline.1', subjectId: 'subject.1', existed: true, observedAt: 1, pageGeneration: 1 }] };
    },
    execute: async ({ identity, runId, start }) => {
      await appendFile(path.join(root, 'effects.txt'), 'effect\\n');
      if (mode === 'execution_crash') { send({ phase: 'effect_written' }); await park(); }
      return { identity, runId, startReceiptId: start.receiptId, startedAt: 2, finishedAt: 3, executedNodeCount: 1, status: 'succeeded', commands: [] };
    },
    observe: async ({ identity, execution, start }) => ({ identity, runId: execution.runId, startReceiptId: start.receiptId, observations: [{ observationId: 'observation.1', subjectId: 'subject.1', pageGeneration: 1, observedAt: 4, fields: { setting: 'desired' }, completeFields: ['setting'] }], enumerations: [] })
  } });
  const result = await session.verify();
  const record = await store.get(request.attemptId);
  await store.close(); await pool.closeAll();
  send({ phase: 'result', status: result.status, code: result.code, ledgerStatus: record.status, executionStatus: record.stages.execution?.status, verificationStatus: record.stages.verification?.status, receiptId: result.receipt?.receiptId, runId: result.receipt?.runId });
  process.disconnect?.();
} catch { send({ phase: 'error', code: 'owned_probe_child_failed' }); process.exitCode = 1; process.disconnect?.(); }
`;
}
function launch(script: string, root: string, mode: string) {
  // fork forwards spawn options, although this Node type version omits the
  // supported window option from ForkOptions.
  const options: ForkOptions & Pick<SpawnOptions, "windowsHide"> = { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true };
  const child = fork(script, [root, mode], options);
  let stderrBytes = 0;
  child.stderr?.on("data", chunk => { stderrBytes = Math.min(4096, stderrBytes + chunk.length); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const packet = new Promise<Packet>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Owned probe child IPC timeout.")), 20_000);
    const done = (operation: () => void) => { clearTimeout(timeout); operation(); };
    child.once("message", value => done(() => {
      if (!value || typeof value !== "object" || JSON.stringify(value).length > 1024 || !("phase" in value) || value.phase === "error") reject(new Error("Owned probe child failed or emitted invalid bounded IPC."));
      else resolve(value as Packet);
    }));
    child.once("error", () => done(() => reject(new Error("Owned probe child could not launch."))));
    child.once("exit", () => done(() => reject(new Error(`Owned probe child exited before IPC (stderr bytes: ${stderrBytes}).`))));
  });
  return { child, exited, packet };
}
async function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Owned probe child shutdown timeout.")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function stop(child: ChildProcess, exited: Promise<unknown>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await bounded(exited, 5_000);
}
const processProbe = process.env.FLUXIQ_CANDIDATE_PROCESS_RESTART_PROBE === "1" ? describe : describe.skip;
processProbe("literal child termination and receipt-ledger process restart", () => {
  it.each(["execution_crash", "finish_crash"])("relaunches after %s without repeating synthetic start/effect", async mode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "candidate-process-restart-"));
    const script = path.join(root, "owned-child.mjs"), children: ReturnType<typeof launch>[] = [];
    try {
      await writeFile(script, childScript());
      const original = launch(script, root, mode); children.push(original);
      const checkpoint = await original.packet;
      expect(checkpoint.phase).toBe(mode === "execution_crash" ? "effect_written" : "finish_committed");
      await stop(original.child, original.exited);
      expect(original.child.killed).toBe(true);
      expect(await original.exited).toEqual({ code: null, signal: "SIGKILL" });
      const restarted = launch(script, root, "reconcile"); children.push(restarted);
      const result = await restarted.packet;
      expect(await bounded(restarted.exited, 5_000)).toEqual({ code: 0, signal: null });
      expect(result.phase).toBe("result"); expect(result.status).toBe("draft");
      expect(await readFile(path.join(root, "starts.txt"), "utf8")).toBe("start\n");
      expect(await readFile(path.join(root, "effects.txt"), "utf8")).toBe("effect\n");
      if (mode === "execution_crash") {
        expect(result.code).toBe("candidate.verification_outcome_unknown");
        expect(result.ledgerStatus).toBe("pending"); expect(result.executionStatus).toBe("pending"); expect(result.verificationStatus).toBeUndefined();
      } else {
        expect(result.code).toBe("candidate.promotion_unsupported_storage_authority");
        expect(result.ledgerStatus).toBe("committed"); expect(result.executionStatus).toBe("committed"); expect(result.verificationStatus).toBe("committed");
        expect(result.receiptId).toBe(checkpoint.receiptId); expect(result.runId).toBe(checkpoint.runId);
      }
    } finally {
      await Promise.all(children.map(child => stop(child.child, child.exited)));
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("candidate-process-restart-")) throw new Error("Refusing cleanup outside owned probe temp directory.");
      await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 60_000);
});
