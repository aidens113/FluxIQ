// t434: a required command that provably never left -- nothing was claimed for
// it, and the ledger claims before any send -- is withdrawn: it no longer holds
// the run, it can never be claimed (so never sent) afterwards, and a stop said
// over it before a claim withdraws it instead of latching the run as uncertain.
// A claimed command is never withdrawn; its outcome stays the ledger's.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandOutcome as Outcome, ClientGatewayCommandContext } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioCommandRunController as Controller, type AutomationStudioCommandRunScope, type AutomationStudioCommandExecutorOwner, type AutomationStudioCommandEffectProvenance } from "../index.ts";

type Harness = { controller: Controller; scope: AutomationStudioCommandRunScope; issue(ordinal: number, attemptId?: string): Promise<ClientGatewayCommandContext> };

async function fixture(operation: (h: Harness) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-command-withdraw-")), bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false }), program = fluxiq.programs.automationStudio;
  const pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
  const facts = new WeakMap<object, AutomationStudioCommandEffectProvenance>();
  const executorOwner: AutomationStudioCommandExecutorOwner = { inspectEffect: capability => facts.get(capability) ?? null, authorizeHandling: () => null };
  const controller = new Controller({ pool, executorOwner, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) });
  try {
    const project = await program.createProject({ name: "Synthetic withdraw", domainId: "synthetic.domain" });
    const flow = { schemaVersion: "0.1" as const, flowId: "flow.1", ownerKind: "routine" as const, ownerId: "routine.1", name: "Synthetic root", nodes: [], edges: [], createdAt: 1, updatedAt: 1 };
    await program.createFlow({ projectId: project.id, flowId: flow.flowId, name: flow.name });
    await program.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Send the synthetic command once." });
    const session = await program.startRuntimeSession({ projectId: project.id, runId: "run.1", flow });
    const scope = await controller.open({ projectId: project.id, runId: session.runId, rootFlowId: session.flowId });
    const issue = async (ordinal: number, attemptId = "synthetic.attempt.1") => {
      const capability = Object.freeze({});
      facts.set(capability, { scope, consumer: Object.freeze({}), nodeId: "synthetic.node", executingFlowId: "flow.1", executingFlowDigest: Rules.digest({ synthetic: "flow" }), invocationId: "synthetic.invocation", attemptId, effectOrdinal: ordinal });
      return await controller.issueEffect(scope, capability);
    };
    await operation({ controller, scope, issue });
  } finally {
    await controller.close();
    await fluxiq.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function claimFor(context: ClientGatewayCommandContext) {
  const owner = ClientGatewayCommandContext.owner(context);
  const binding = { projectId: owner.projectId, runId: owner.runId, flowId: owner.flowId, invocationId: owner.invocationId, attemptId: owner.attemptId, effectOrdinal: owner.effectOrdinal };
  return { binding: { schemaVersion: "gateway_command.v1" as const, ...binding, commandId: Rules.commandId(binding), clientId: "synthetic.client", sessionId: "synthetic.session" }, requestDigest: Rules.digest({ items: ["synthetic"] }) };
}

describe("withdrawing a required command that never left", () => {
  it("frees the run for a new attempt and refuses any later claim, so it can never be sent", async () => fixture(async h => {
    const context = await h.issue(0);
    expect(h.controller.withdraw(context)).toBe(true);
    await h.controller.checkpoint(h.scope);
    const lease = await h.controller.resolve(context);
    await expect(lease.ledger.claim(claimFor(context))).rejects.toThrow("command_run.effect_withdrawn");
    expect(h.controller.receipted(context)).toBe(false);
    // The retry issues the act again under a new attempt, and it may be claimed.
    const retry = await h.issue(0, "synthetic.attempt.2");
    const retried = await h.controller.resolve(retry);
    await expect(retried.ledger.claim(claimFor(retry))).resolves.toMatchObject({ sendAllowed: true });
  }), 60_000);

  it("withdraws on a stop said before any claim instead of latching the run as uncertain", async () => fixture(async h => {
    const context = await h.issue(0);
    await Outcome.stop(context, "runtime.missing_target");
    await h.controller.checkpoint(h.scope);
    expect(h.controller.withdraw(context)).toBe(true);
  }), 60_000);

  it("never withdraws a claimed command: a stop over it latches the run", async () => fixture(async h => {
    const context = await h.issue(0);
    const lease = await h.controller.resolve(context);
    await expect(lease.ledger.claim(claimFor(context))).resolves.toMatchObject({ sendAllowed: true });
    expect(h.controller.withdraw(context)).toBe(false);
    await Outcome.stop(context, "runtime.timeout");
    await expect(h.controller.checkpoint(h.scope)).rejects.toThrow("command_run.outcome_unknown");
  }), 60_000);
});
