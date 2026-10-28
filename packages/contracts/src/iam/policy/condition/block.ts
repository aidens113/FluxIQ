import { z } from "zod";
import { iamConditionKeyValueType } from "./keys.ts";
import { parseIamConditionOperator, type IamConditionValueType } from "./operators.ts";
import { replaceIamPolicyVariables } from "../policy-variables.ts";

/** Most values one condition key may list (any of them matches). */
export const IAM_CONDITION_MAX_VALUES = 100;

const conditionValueSchema = z.union([z.string().max(1024), z.boolean()]);

/**
 * A statement's `Condition`: `{ <Operator>: { <conditionKey>: value | value[] } }`.
 * Every operator and every key must match for the statement to apply; a key's
 * values match when any one does. Checked here: the operator is known
 * (`IfExists` allowed), the key is a defined condition key, the operator's type
 * fits the key's, and each value fits the type -- a string (variables allowed),
 * a boolean or `"true"`/`"false"`, an IP address or CIDR block, an ISO 8601
 * instant.
 */
export const iamPolicyConditionSchema = z
  .record(z.string(), z.record(z.string(), z.union([conditionValueSchema, z.array(conditionValueSchema).min(1).max(IAM_CONDITION_MAX_VALUES)])))
  .superRefine((condition, context) => {
    const operators = Object.entries(condition);
    if (operators.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "a Condition names at least one operator" });
    for (const [name, keys] of operators) {
      const operator = parseIamConditionOperator(name);
      if (operator === null) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `unknown condition operator ${name}` });
        continue;
      }
      if (Object.keys(keys).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: "an operator names at least one condition key" });
      for (const [key, raw] of Object.entries(keys)) {
        const keyType = iamConditionKeyValueType(key);
        if (keyType === null) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [name, key], message: `unknown condition key ${key}` });
          continue;
        }
        if (keyType !== operator.valueType) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [name, key], message: `${name} compares ${operator.valueType} values; ${key} holds ${keyType}` });
          continue;
        }
        const values = Array.isArray(raw) ? raw : [raw];
        values.forEach((value, index) => {
          if (!valueFits(operator.valueType, value)) context.addIssue({ code: z.ZodIssueCode.custom, path: [name, key, index], message: `not a ${operator.valueType} value` });
        });
      }
    }
  });

export type IamPolicyCondition = z.infer<typeof iamPolicyConditionSchema>;

function valueFits(type: IamConditionValueType, value: string | boolean): boolean {
  if (type === "bool") return typeof value === "boolean" || value === "true" || value === "false";
  if (typeof value !== "string") return false;
  if (type === "string") return replaceIamPolicyVariables(value, "v") !== null;
  if (type === "ip") return isIpOrCidr(value);
  return isIsoInstant(value);
}

const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u;
const IPV6_PATTERN = /^[0-9A-Fa-f:]{2,39}$/u;

function isIpOrCidr(value: string): boolean {
  const [address, prefix, extra] = value.split("/");
  if (address === undefined || extra !== undefined) return false;
  const v4 = IPV4_PATTERN.test(address);
  const v6 = !v4 && IPV6_PATTERN.test(address) && address.includes(":") && isIpv6(address);
  if (!v4 && !v6) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/u.test(prefix)) return false;
  return Number(prefix) <= (v4 ? 32 : 128);
}

function isIpv6(address: string): boolean {
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  if (!groups.every((group) => /^[0-9A-Fa-f]{1,4}$/u.test(group))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

function isIsoInstant(value: string): boolean {
  return ISO_INSTANT_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}
