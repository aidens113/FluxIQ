import { readFileSync } from "node:fs";
import type { CommerceConfig, CommerceGrantTemplate, CommercePlan, CommercePlanCatalog, CommercePlanLine, CommercePlanUnit } from "./types";

const ALLOCATIONS = new Set(["control", "shared", "dedicated"]);
const UNITS = new Set(["dedicated-browser", "seat", "flat"]);
/** Stripe's bounds on a checkout session's expiry, and the lifetime used when the file names none. */
const CHECKOUT_LIFETIME = { minimum: 30 * 60_000, maximum: 24 * 3_600_000, unnamed: 3_600_000 };

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
  const refreshAfterMs = count(value.refreshAfterMs, "refreshAfterMs", 1);
  const maxVerificationAgeMs = value.maxVerificationAgeMs === undefined ? refreshAfterMs * 2 : count(value.maxVerificationAgeMs, "maxVerificationAgeMs", 1);
  if (maxVerificationAgeMs <= refreshAfterMs) invalid(`maxVerificationAgeMs (${maxVerificationAgeMs}) must exceed refreshAfterMs (${refreshAfterMs})`);
  const catalog = plans(value.plans);
  const checkoutLifetimeMs = value.checkoutLifetimeMs === undefined ? CHECKOUT_LIFETIME.unnamed : count(value.checkoutLifetimeMs, "checkoutLifetimeMs", CHECKOUT_LIFETIME.minimum);
  if (checkoutLifetimeMs > CHECKOUT_LIFETIME.maximum) invalid(`checkoutLifetimeMs must be at most ${CHECKOUT_LIFETIME.maximum} (24 hours)`);
  const config: CommerceConfig = {
    provider,
    allowTrial: value.allowTrial,
    graceMs: count(value.graceMs, "graceMs", 0),
    retentionMs: count(value.retentionMs, "retentionMs", 0),
    refreshAfterMs,
    maxVerificationAgeMs,
    plans: catalog,
    secretKeyFile: provider === "stripe" ? text(value.secretKeyFile, "secretKeyFile") : null,
    webhookSecretFile: text(value.webhookSecretFile, "webhookSecretFile"),
    apiBaseUrl: value.apiBaseUrl === undefined || value.apiBaseUrl === null ? null : baseUrl(value.apiBaseUrl),
    checkoutLifetimeMs,
    region: region(value.region, catalog)
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
    const name = plan.name === undefined ? planId : text(plan.name, `plans.${planId}.name`);
    // A plan of one line may name it inline: { priceId, unit, quantity, grants }.
    const listed = plan.lines === undefined ? [plan] : plan.lines;
    if (!Array.isArray(listed) || listed.length === 0) invalid(`plans.${planId}.lines must be a nonempty list`);
    const lines = listed.map((line, index) => planLine(line, plan.lines === undefined ? `plans.${planId}` : `plans.${planId}.lines[${index}]`));
    for (const line of lines) {
      if (prices.has(line.priceId)) invalid(`plans.${planId} sells price ${line.priceId}, which another line already sells`);
      prices.add(line.priceId);
    }
    catalog[planId] = { name, lines };
  }
  return catalog;
}

function planLine(value: unknown, name: string): CommercePlanLine {
  const line = object(value, name);
  const priceId = text(line.priceId, `${name}.priceId`);
  if (!Array.isArray(line.grants) || line.grants.length === 0) invalid(`${name}.grants must be a nonempty list`);
  const unit = line.unit === undefined ? "flat" : line.unit;
  if (typeof unit !== "string" || !UNITS.has(unit)) invalid(`${name}.unit must be dedicated-browser, seat or flat`);
  const quantity = line.quantity === undefined ? 1 : count(line.quantity, `${name}.quantity`, 1);
  if (unit === "flat" && quantity !== 1) invalid(`${name}.quantity must be 1 for a flat price: it counts nothing`);
  const grants = line.grants.map((grant, index) => template(grant, `${name}.grants[${index}]`));
  if (unit === "dedicated-browser" && !grants.some((grant) => grant.allocation === "dedicated")) invalid(`${name}.grants must include a dedicated grant: a dedicated-browser price counts dedicated browsers`);
  return { priceId, unit: unit as CommercePlanUnit, quantity, grants };
}

/** The deployment's dedicated region: the one the file names, or the one every dedicated grant names. */
function region(value: unknown, catalog: CommercePlanCatalog): string | null {
  const granted = new Set<string>();
  for (const plan of Object.values(catalog)) for (const line of plan.lines) for (const grant of line.grants) if (grant.allocation === "dedicated") grant.regions.forEach((entry) => granted.add(entry));
  if (value !== undefined) {
    const named = text(value, "region");
    if (granted.size > 0 && !granted.has(named)) invalid(`region ${named} is not a region any dedicated grant names`);
    return named;
  }
  if (granted.size > 1) invalid(`region must be named: dedicated grants name several regions (${[...granted].join(", ")})`);
  return [...granted][0] ?? null;
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
