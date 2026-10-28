/** The condition operators at launch; each also takes the `IfExists` suffix. */
export const IAM_CONDITION_OPERATORS = Object.freeze([
  "StringEquals",
  "StringNotEquals",
  "StringLike",
  "Bool",
  "IpAddress",
  "NotIpAddress",
  "DateLessThan",
  "DateGreaterThan"
] as const);

export type IamConditionOperator = (typeof IAM_CONDITION_OPERATORS)[number];

/** The value type an operator compares. */
export type IamConditionValueType = "string" | "bool" | "ip" | "date";

const OPERATOR_TYPES: ReadonlyMap<string, IamConditionValueType> = new Map<IamConditionOperator, IamConditionValueType>([
  ["StringEquals", "string"],
  ["StringNotEquals", "string"],
  ["StringLike", "string"],
  ["Bool", "bool"],
  ["IpAddress", "ip"],
  ["NotIpAddress", "ip"],
  ["DateLessThan", "date"],
  ["DateGreaterThan", "date"]
]);

const IF_EXISTS = "IfExists";

/**
 * Reads a condition block's operator name (`StringLikeIfExists`), or returns
 * null for one not in `IAM_CONDITION_OPERATORS`.
 */
export function parseIamConditionOperator(name: string): { operator: IamConditionOperator; ifExists: boolean; valueType: IamConditionValueType } | null {
  const ifExists = name.endsWith(IF_EXISTS);
  const base = ifExists ? name.slice(0, -IF_EXISTS.length) : name;
  const valueType = OPERATOR_TYPES.get(base);
  if (valueType === undefined) return null;
  return { operator: base as IamConditionOperator, ifExists, valueType };
}
