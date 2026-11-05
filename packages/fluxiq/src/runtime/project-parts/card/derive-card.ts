// A saved part's card, and the snapshot a run reads, derived from its graph, its
// Subflow record and the person's request words. Pure: it reads no store and no
// page.
//
// **No page text reaches the card.** Its name and purpose are the person's words
// for the part, or the planner's, screened; its sites are exact origins; its ports
// are the graph's own interface; its fixed values are the literals the part types
// and a control's words only when the person's request holds them too. A node's
// label, a target's text and a read's result are never read for it. A part that
// cannot be described that way is not saved, with a stable reason, and that is a
// result, never an error.
import { parseAutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { automationStudioSubflowContract } from "../../../engine/automation/lifecycle/index.ts";
import { partCalleeOf } from "./calls.ts";
import { PART_DEFAULT_CONTROL_KEYS, type AutomationStudioPartControlReading } from "./parameter-keys.ts";
import { partEndCheckOf } from "./end-check.ts";
import { partFixedValuesOf } from "./fixed-values.ts";
import { partLastingClassesOf } from "./lasting-classes.ts";
import { partTargetLeavesOf } from "./target-leaves.ts";
import { partSitesOf } from "./origins.ts";
import { partPortsOf } from "./ports.ts";
import { partShapeHashOf } from "./shape-hash.ts";
import { partStartCheckOf } from "./start-check.ts";
import { partStepsOf } from "./steps.ts";
import { screenedPartWords } from "./words.ts";
import type { AutomationStudioPartCardInput, AutomationStudioPartCardResult, AutomationStudioPartSnapshot, AutomationStudioStoredPartCard } from "./types.ts";

/** The description a bootstrap writes for every Subflow it builds: nothing a person said. */
const GENERATED_DESCRIPTION = /^Instruction-built graph for /u;

const PLACEHOLDER_TRUST = { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } } as const;

export function deriveAutomationStudioPartCard(input: AutomationStudioPartCardInput): AutomationStudioPartCardResult {
  const name = screenedPartWords(input.words?.name, "name") ?? screenedPartWords(input.subflowName, "name");
  if (!name) return { skipped: "part.name_unusable" };
  const description = input.subflowDescription && !GENERATED_DESCRIPTION.test(input.subflowDescription) ? input.subflowDescription : undefined;
  const purpose = screenedPartWords(input.words?.purpose, "purpose") ?? screenedPartWords(description, "purpose") ?? name;
  const callees = input.callees ?? {};
  const contract = automationStudioSubflowContract({ nodes: input.graph.nodes, ...(input.graph.metadata ? { metadata: input.graph.metadata } : {}) });
  if (contract.problems.length > 0) return { skipped: "part.contract_unreadable", detail: contract.problems[0]! };
  const steps = partStepsOf(input.graph);
  if (!steps.some((step) => step.acting)) return { skipped: "part.no_acting_step" };
  const inputs = partPortsOf(input.graph.interface.inputs);
  const outputs = partPortsOf(input.graph.interface.outputs);
  if (!inputs || !outputs) return { skipped: "part.port_unusable" };
  const control: AutomationStudioPartControlReading = { controlKeys: new Set(input.controlParameterKeys ?? PART_DEFAULT_CONTROL_KEYS), targetWords: input.targetWords ?? partTargetLeavesOf };
  const fixed = partFixedValuesOf(steps, input.requestWords, control);
  if (fixed.problem) return { skipped: fixed.problem };
  const lasting = partLastingClassesOf(steps, callees);
  if ("problem" in lasting) return { skipped: lasting.problem, detail: lasting.nodeId };
  if (lasting.classes.length > 0 && fixed.fromRequest) return { skipped: "part.fixed_value_from_request" };
  const callSites: { nodeId: string; partId: string; version: number }[] = [];
  const calledSites: string[] = [];
  for (const step of steps) {
    if (!step.isCall) continue;
    const callee = partCalleeOf(step, callees);
    if (!callee) return { skipped: "part.unresolved_call", detail: step.node.id };
    callSites.push({ nodeId: step.node.id, partId: callee.partId, version: callee.version });
    calledSites.push(...callee.sites);
  }
  const sites = [...new Set([...partSitesOf(steps, input.startLocation), ...calledSites])].sort();
  const calls = uniqueCalls(callSites);
  const startCheck = partStartCheckOf({ contract, steps, sites, controlKeys: control.controlKeys });
  const endCheck = partEndCheckOf(contract);
  const card: AutomationStudioStoredPartCard = {
    partId: input.partId,
    version: input.version ?? 1,
    name,
    purpose,
    sites,
    inputs,
    outputs,
    fixedValues: fixed.values,
    lastingClasses: lasting.classes,
    ...(startCheck.check ? { startCheck: startCheck.check } : {}),
    ...(endCheck ? { endCheck } : {}),
    calls,
    shapeHash: partShapeHashOf({ graph: input.graph, steps, callees, controlKeys: control.controlKeys })
  };
  const parsed = parseAutomationStudioSubflowCard({ ...card, trust: PLACEHOLDER_TRUST });
  if (!parsed.ok) return { skipped: "part.card_invalid", detail: parsed.issues.join(",") };
  const { trust: _trust, ...stored } = parsed.card;
  const snapshot: AutomationStudioPartSnapshot = {
    schemaVersion: "automation-studio.project-part.v1",
    graph: {
      interface: structuredClone(input.graph.interface),
      nodes: structuredClone(input.graph.nodes),
      edges: structuredClone(input.graph.edges),
      ...(input.graph.metadata ? { metadata: structuredClone(input.graph.metadata) } : {})
    },
    start: startCheck.start,
    end: { conditions: structuredClone(contract.successCheck) }
  };
  return {
    card: stored,
    snapshot,
    searchable: { name, purpose, ports: [...inputs, ...outputs].map((port) => port.name) },
    facets: { site: sites, input: inputs.map((port) => port.id), output: outputs.map((port) => port.id), lasting: [...lasting.classes] },
    callSites
  };
}

function uniqueCalls(sites: readonly { partId: string; version: number }[]): { partId: string; version: number }[] {
  const seen = new Map(sites.map((site) => [`${site.partId}@${site.version}`, { partId: site.partId, version: site.version }]));
  return [...seen.values()].sort((left, right) => (left.partId === right.partId ? left.version - right.version : left.partId < right.partId ? -1 : 1));
}
