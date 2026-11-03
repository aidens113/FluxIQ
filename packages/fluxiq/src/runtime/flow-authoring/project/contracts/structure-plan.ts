import type { AutomationStudioProjectParse, AutomationStudioProjectStructurePlan, AutomationStudioProjectTaskSpec } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import { automationStudioFlowBootstrapRouteIssues } from "../../plan/index.ts";
import type { AutomationStudioFlowBootstrapFactCondition, AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapRouter, AutomationStudioFlowBootstrapSubflow } from "../../../../flows/authoring/plan/index.ts";
import { readAutomationStudioProjectSubflowInterface } from "./subflow-interface.ts";

const VERSION = "project.structure_plan.v1";
const ROLES = ["primary", "integration", "recovery", "fallback", "utility"] as const;
const FACT_OPS = ["exists", "absent", "visible", "enabled", "equals", "contains", "matches", "count"] as const;
const LIMITS = { subflows: 40, rules: 40, checks: 20, tags: 20, requires: 20, parts: 50 } as const;

export const automationStudioProjectStructurePlan = Object.freeze({
  digest(plan: Omit<AutomationStudioProjectStructurePlan, "digest">): string {
    return automationStudioProjectDigest(VERSION, { taskSpecDigest: plan.taskSpecDigest, plan: plan.plan, partOf: plan.partOf });
  },

  /** Reads a structure plan; refuses a non-empty body or a digest that is not its own. */
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectStructurePlan> {
    return shape.parse(() => read(value));
  },

  /** What stops this plan being dispatched against this task spec. */
  issues(structure: AutomationStudioProjectStructurePlan, taskSpec: AutomationStudioProjectTaskSpec): Array<{ code: string; path: string }> {
    const issues: Array<{ code: string; path: string }> = [];
    if (structure.taskSpecDigest !== taskSpec.digest) issues.push({ code: "project.plan_task_spec_stale", path: "structurePlan.taskSpecDigest" });
    const partIds = new Set(taskSpec.parts.map((part) => part.id));
    const covered = new Set<string>();
    for (const [key, parts] of Object.entries(structure.partOf)) {
      for (const [index, part] of parts.entries()) {
        if (!partIds.has(part)) issues.push({ code: "project.plan_part_unknown", path: `structurePlan.partOf.${key}.${index}` });
        covered.add(part);
      }
    }
    for (const [index, part] of taskSpec.parts.entries()) {
      if (!covered.has(part.id)) issues.push({ code: "project.plan_part_uncovered", path: `taskSpec.parts.${index}` });
    }
    issues.push(...carriedTwice(structure));
    const laterReached = new Set(structure.plan.subflows.flatMap((subflow, index) => (subflow.interface || subflow.role === "recovery" ? [index] : [])));
    for (const issue of automationStudioFlowBootstrapRouteIssues(structure.plan)) {
      if (issue.severity !== "error") continue;
      const unreachable = /^plan\.subflows\.(\d+)$/u.exec(issue.path ?? "");
      if (issue.code === "bootstrap.subflow_unreachable" && unreachable && laterReached.has(Number(unreachable[1]))) continue;
      issues.push({ code: issue.code, path: `structurePlan.${issue.path ?? "plan"}` });
    }
    return issues;
  }
});

/** The router's situation alternatives, as the one carrier they count as. */
const ROUTER_CHOICE = Symbol("router choice");

/** Each carrier of a part after its first, by its `partOf` entry; the router's situation alternatives are one carrier and a recovery subflow none (header). */
function carriedTwice(structure: AutomationStudioProjectStructurePlan): Array<{ code: string; path: string }> {
  const { router, subflows } = structure.plan;
  const alternatives = new Set(router.rules.length ? [...router.rules.map((rule) => rule.targetSubflowKey), ...(router.fallback.kind === "subflow" ? [router.fallback.targetSubflowKey] : [])] : []);
  const recovery = new Set(subflows.filter((subflow) => subflow.role === "recovery").map((subflow) => subflow.key));
  /** The carrier each part was first given to: a subflow key, or the router's alternatives as one. */
  const first = new Map<string, string | typeof ROUTER_CHOICE>();
  const issues: Array<{ code: string; path: string }> = [];
  for (const [key, parts] of Object.entries(structure.partOf)) {
    if (recovery.has(key)) continue;
    const carrier = alternatives.has(key) ? ROUTER_CHOICE : key;
    for (const [index, part] of parts.entries()) {
      const held = first.get(part);
      if (held === undefined) first.set(part, carrier);
      else if (held !== carrier) issues.push({ code: "project.plan_part_carried_twice", path: `structurePlan.partOf.${key}.${index}` });
    }
  }
  return issues;
}

function read(value: unknown): AutomationStudioProjectStructurePlan {
  const fields = shape.object(value, "structurePlan", ["taskSpecDigest", "plan", "partOf", "digest"]);
  const plan = readPlan(fields.plan, "structurePlan.plan");
  const keys = plan.subflows.map((subflow) => subflow.key);
  const rawPartOf = shape.object(fields.partOf, "structurePlan.partOf", keys);
  const partOf: Record<string, string[]> = {};
  for (const key of keys) partOf[key] = shape.ids(rawPartOf[key], `structurePlan.partOf.${key}`, LIMITS.parts);
  const taskSpecDigest = shape.digest(fields.taskSpecDigest, "structurePlan.taskSpecDigest");
  const digest = shape.digest(fields.digest, "structurePlan.digest");
  if (digest !== automationStudioProjectStructurePlan.digest({ taskSpecDigest, plan, partOf })) return shape.refuse("project.plan_digest_mismatch", "structurePlan.digest");
  return { taskSpecDigest, plan, partOf, digest };
}

function readPlan(value: unknown, path: string): AutomationStudioFlowBootstrapPlan {
  const fields = shape.object(value, path, ["schemaVersion", "router", "subflows"], ["metadata"]);
  if (fields.schemaVersion !== "0.1") return shape.refuse("project.plan_schema_version", `${path}.schemaVersion`);
  const rawSubflows = shape.array(fields.subflows, `${path}.subflows`, LIMITS.subflows);
  if (!rawSubflows.length) return shape.refuse("project.plan_no_subflows", `${path}.subflows`);
  const subflows = rawSubflows.map((subflow, index) => readSubflow(subflow, `${path}.subflows.${index}`));
  const keys = new Set(subflows.map((subflow) => subflow.key));
  if (keys.size !== subflows.length) return shape.refuse("project.duplicate_subflow", `${path}.subflows`);
  const router = readRouter(fields.router, `${path}.router`, keys);
  const plan: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router, subflows };
  if (fields.metadata !== undefined) {
    const metadata = shape.object(fields.metadata, `${path}.metadata`, ["requires"]);
    plan.metadata = { requires: shape.ids(metadata.requires, `${path}.metadata.requires`, LIMITS.requires) };
  }
  return plan;
}

function readRouter(value: unknown, path: string, keys: ReadonlySet<string>): AutomationStudioFlowBootstrapRouter {
  const fields = shape.object(value, path, ["name", "rules", "fallback"]);
  const target = (key: unknown, at: string): string => {
    const id = shape.id(key, at);
    return keys.has(id) ? id : shape.refuse("project.plan_unknown_subflow", at);
  };
  const rules = shape.array(fields.rules, `${path}.rules`, LIMITS.rules).map((rule, index) => {
    const at = `${path}.rules.${index}`;
    const ruleFields = shape.object(rule, at, ["key", "name", "targetSubflowKey", "routeTags"], ["condition"]);
    const out: AutomationStudioFlowBootstrapRouter["rules"][number] = {
      key: shape.id(ruleFields.key, `${at}.key`),
      name: shape.text(ruleFields.name, `${at}.name`, 200),
      targetSubflowKey: target(ruleFields.targetSubflowKey, `${at}.targetSubflowKey`),
      routeTags: shape.ids(ruleFields.routeTags, `${at}.routeTags`, LIMITS.tags)
    };
    if (ruleFields.condition !== undefined) out.condition = shape.json(ruleFields.condition, `${at}.condition`) as NonNullable<typeof out.condition>;
    return out;
  });
  const fallback = shape.object(fields.fallback, `${path}.fallback`, ["kind"], ["targetSubflowKey"]);
  const kind = shape.oneOf(fallback.kind, `${path}.fallback.kind`, ["subflow", "fail"] as const);
  if (kind === "fail" && fallback.targetSubflowKey !== undefined) return shape.refuse("project.unknown_field", `${path}.fallback.targetSubflowKey`);
  return {
    name: shape.text(fields.name, `${path}.name`, 200),
    rules,
    fallback: kind === "fail" ? { kind } : { kind, targetSubflowKey: target(fallback.targetSubflowKey, `${path}.fallback.targetSubflowKey`) }
  };
}

function readSubflow(value: unknown, path: string): AutomationStudioFlowBootstrapSubflow {
  const fields = shape.object(value, path, ["key", "name", "role", "nodes", "edges"], ["interface", "metadata"]);
  if (!Array.isArray(fields.nodes) || !Array.isArray(fields.edges)) return shape.refuse("project.not_array", `${path}.nodes`);
  if (fields.nodes.length || fields.edges.length) return shape.refuse("project.plan_body_not_empty", path);
  const subflow: AutomationStudioFlowBootstrapSubflow = {
    key: shape.id(fields.key, `${path}.key`),
    name: shape.text(fields.name, `${path}.name`, 200),
    role: shape.oneOf(fields.role, `${path}.role`, ROLES),
    nodes: [],
    edges: []
  };
  if (fields.metadata !== undefined) {
    const metadata = shape.object(fields.metadata, `${path}.metadata`, ["fluxiq.successCheck"], ["requires"]);
    const checks = shape.array(metadata["fluxiq.successCheck"], `${path}.metadata.fluxiq.successCheck`, LIMITS.checks);
    if (!checks.length) return shape.refuse("project.plan_success_check_missing", `${path}.metadata.fluxiq.successCheck`);
    subflow.metadata = { "fluxiq.successCheck": checks.map((check, index) => readFact(check, `${path}.metadata.fluxiq.successCheck.${index}`)) };
    if (metadata.requires !== undefined) subflow.metadata.requires = shape.ids(metadata.requires, `${path}.metadata.requires`, LIMITS.requires);
  }
  if (fields.interface !== undefined) subflow.interface = readAutomationStudioProjectSubflowInterface(fields.interface, `${path}.interface`);
  return subflow;
}

function readFact(value: unknown, path: string): AutomationStudioFlowBootstrapFactCondition {
  const fields = shape.object(value, path, ["fact", "op"], ["value", "target"]);
  const fact: AutomationStudioFlowBootstrapFactCondition = { fact: shape.id(fields.fact, `${path}.fact`), op: shape.oneOf(fields.op, `${path}.op`, FACT_OPS) };
  if (fields.value !== undefined) fact.value = shape.json(fields.value, `${path}.value`) as NonNullable<AutomationStudioFlowBootstrapFactCondition["value"]>;
  if (fields.target !== undefined) fact.target = shape.json(fields.target, `${path}.target`) as NonNullable<AutomationStudioFlowBootstrapFactCondition["target"]>;
  return fact;
}
