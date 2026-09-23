// A Flow's result checking as its stored settings describe it.
//
// Read defensively throughout, and for one reason: a Flow that has never been
// configured must come back with the documented defaults, so **every existing
// Flow gets the default schedule with no migration and no backfill**. An absent
// `resultCheck` block is not "checking is off"; it is "nobody has said", and
// what nobody has said is the default.
//
// The authorization is the opposite way round. It is absent until a person
// turns checking on, and an absent one means an unattended run obtains no
// model and records `unverified` with its own code. That asymmetry is
// deliberate: a schedule is a preference and defaults, a permission to spend is
// not and never defaults.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, type AutomationStudioResultCheckAuthorization } from "../../result-check-authorization/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS,
  automationStudioResultCheckShapeValue,
  type AutomationStudioResultCheckConfiguration,
  type AutomationStudioResultCheckSettings
} from "../../result-check-schedule/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { finiteNumber } from "../scalar-readings/index.ts";
import { booleanSetting, stringSetting } from "./settings-readings.ts";

export function resultCheckConfigurationFromMetadata(settings: JsonObject): AutomationStudioResultCheckConfiguration {
  const stored = jsonObjectFromUnknown(settings.resultCheck) ?? {};
  const schedule = jsonObjectFromUnknown(stored.schedule) ?? {};
  const authorization = automationStudioResultCheckAuthorizationFromMetadata(stored.authorization);
  const ceiling = maxInterval(schedule);
  return {
    schedule: {
      enabled: booleanSetting(schedule.enabled, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.enabled),
      shape: automationStudioResultCheckShapeValue(schedule.shape),
      initialRunCount: atLeast(finiteNumber(schedule.initialRunCount), 0, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.initialRunCount),
      interval: atLeast(finiteNumber(schedule.interval), 1, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.interval),
      decay: atLeast(finiteNumber(schedule.decay), 1, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.decay),
      ...(ceiling !== undefined ? { maxInterval: ceiling } : {}),
      repairOnRefutation: booleanSetting(schedule.repairOnRefutation, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.repairOnRefutation)
    },
    ...(authorization ? { authorization } : {})
  };
}

/**
 * The standing authorization a Flow holds, or nothing.
 *
 * Every field is required and every one is checked, because a half-written
 * record is a permission nobody actually gave. The task kind is not read from
 * storage at all: it is set to the only value it may have, so a settings
 * document edited by hand to say `runtime_patch` reads back as a verification
 * authorization and is refused by `redeem.ts` on scope anyway.
 */
export function automationStudioResultCheckAuthorizationFromMetadata(value: unknown): AutomationStudioResultCheckAuthorization | undefined {
  const stored = jsonObjectFromUnknown(value);
  if (!stored) return undefined;
  const keyId = stringSetting(stored.keyId, "");
  const authorizedByUserId = stringSetting(stored.authorizedByUserId, "");
  const unlockSessionId = stringSetting(stored.unlockSessionId, "");
  const maxTotalCostUsd = finiteNumber(stored.maxTotalCostUsd);
  const maxCostUsdPerCall = finiteNumber(stored.maxCostUsdPerCall);
  const grantedAtMs = finiteNumber(stored.grantedAtMs);
  const expiresAtMs = finiteNumber(stored.expiresAtMs);
  if (!keyId || !authorizedByUserId || !unlockSessionId) return undefined;
  if (maxTotalCostUsd === undefined || maxCostUsdPerCall === undefined || grantedAtMs === undefined || expiresAtMs === undefined) return undefined;
  return { taskKind: AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, authorizedByUserId, unlockSessionId, keyId, maxTotalCostUsd, maxCostUsdPerCall, grantedAtMs, expiresAtMs };
}

function atLeast(value: number | undefined, floor: number, fallback: number): number {
  if (value === undefined) return fallback;
  return Math.max(floor, Math.trunc(value));
}

function maxInterval(schedule: JsonObject): number | undefined {
  const value = finiteNumber(schedule.maxInterval);
  return value === undefined ? undefined : Math.max(1, Math.trunc(value));
}
