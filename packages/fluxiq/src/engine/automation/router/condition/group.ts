export function executableRouteGroupReason(type: "all" | "any" | "none", children: Array<{ matched: boolean }>): string {
  const matched = children.filter((child) => child.matched).length;
  return `${type} group matched ${matched} of ${children.length} conditions.`;
}
