/** Each lasting class in the word its badge shows, in the order badges are drawn. */
const BADGES: ReadonlyArray<readonly [string, string]> = [
  ["send_or_publish", "sends"],
  ["delete", "deletes"],
  ["move_money", "pays"],
  ["modify_existing", "changes"],
  ["create_new", "creates"]
];

/** The badges for a step's declared lasting classes; a class this screen does not know is shown as "changes". */
export function lastingBadges(classes: readonly string[]): string[] {
  const badges = BADGES.filter(([lasting]) => classes.includes(lasting)).map(([, word]) => word);
  const unknown = classes.some((lasting) => !BADGES.some(([known]) => known === lasting));
  if (unknown && !badges.includes("changes")) badges.push("changes");
  return badges;
}
