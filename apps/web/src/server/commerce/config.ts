import { readFileSync } from "node:fs";
import type { CommerceConfig, CommerceGrantTemplate, CommercePlan, CommercePlanCatalog } from "./types";

const ALLOCATIONS = new Set(["control", "shared", "dedicated"]);

/**
 * The billing configuration, or null when this server bills nothing
 * (`FLUXIQ_COMMERCE_CONFIG_FILE` unset). A malformed file throws, naming the
 * field: billing never runs on a guessed grace, retention or plan.
 */
export function commerceConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  readFile: (file: string) => string = (file) => readFileSync(file, "utf8")
): CommerceConfig | null {
  const file = env.FLUXIQ_COMMERCE_CONFIG_FILE?.trim();
  if (!file) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFile(file));
  } catch (error) {
    throw new Error(`commerce.configuration: FLUXIQ_COMMERCE_CONFIG_FILE could not be read as JSON (${error instanceof Error ? error.name : "error"}).`);
  }
  const value = object(raw, "the file");
  const provider = value.provider;
  if (provider !== "stripe" && provider !== "fake") invalid("provider must be \"stripe\" or \"fake\"");
  if (typeof value.allowTrial !== "boolean") invalid("allowTrial must be a boolean");
  const config: CommerceConfig = {
    provider,
    allowTrial: value.allowTrial,
    graceMs: count(value.graceMs, "graceMs", 0),
    retentionMs: count(value.retentionMs, "retentionMs", 0),
    refreshAfterMs: count(value.refreshAfterMs, "refreshAfterMs", 1),
    plans: plans(value.plans),
    secretKeyFile: provider === "stripe" ? text(value.secretKeyFile, "secretKeyFile") : null,
    webhookSecretFile: text(value.webhookSecretFile, "webhookSecretFile"),
    apiBaseUrl: value.apiBaseUrl === undefined || value.apiBaseUrl === null ? null : baseUrl(value.apiBaseUrl)
  };
  if (provider === "fake" && config.apiBaseUrl !== null) invalid("apiBaseUrl applies to the stripe provider only");
  return config;
}

function plans(value: unknown): CommercePlanCatalog {
  const entries = Object.entries(object(value, "plans"));
  if (entries.length === 0) invalid("plans must name at least one plan");
  const catalog: Record<string, CommercePlan> = {};
  const prices = new Set<string>();
  for (const [planId, entry] of entries) {
    identifier(planId, "a plan id");
    const plan = object(entry, `plans.${planId}`);
    const priceId = text(plan.priceId, `plans.${planId}.priceId`);
    if (prices.has(priceId)) invalid(`plans.${planId}.priceId is used by another plan`);
    prices.add(priceId);
    if (!Array.isArray(plan.grants) || plan.grants.length === 0) invalid(`plans.${planId}.grants must be a nonempty list`);
    catalog[planId] = { priceId, grants: plan.grants.map((grant, index) => template(grant, `plans.${planId}.grants[${index}]`)) };
  }
  return catalog;
}

function template(value: unknown, name: string): CommerceGrantTemplate {
  const grant = object(value, name);
  const allocation = grant.allocation;
  if (typeof allocation !== "string" || !ALLOCATIONS.has(allocation)) invalid(`${name}.allocation must be control, shared or dedicated`);
  const regions = strings(grant.regions, `${name}.regions`);
  if (allocation !== "control" && regions.length === 0) invalid(`${name}.regions must name a region`);
  const capabilities = strings(grant.capabilities, `${name}.capabilities`);
  if (capabilities.length === 0) invalid(`${name}.capabilities must name a capability`);
  return { key: text(grant.key, `${name}.key`), allocation: allocation as CommerceGrantTemplate["allocation"], capabilities, regions };
}

function baseUrl(value: unknown): string {
  const url = new URL(text(value, "apiBaseUrl"));
  if (url.protocol !== "http:" && url.protocol !== "https:") invalid("apiBaseUrl must be http or https");
  return url.origin;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) invalid(`${name} must be a list`);
  for (const entry of value) identifier(entry, name);
  if (new Set(value).size !== value.length) invalid(`${name} has a duplicate`);
  return [...value] as string[];
}

function text(value: unknown, name: string): string {
  identifier(value, name);
  return value as string;
}

function identifier(value: unknown, name: string): void {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) invalid(`${name} must be a nonempty string`);
}

function count(value: unknown, name: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid(`${name} must be an integer of at least ${minimum}`);
  return value as number;
}

function invalid(message: string): never {
  throw new Error(`commerce.configuration: ${message}.`);
}
