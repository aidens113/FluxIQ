/** A list a domain names by some of its fields and a count of the rest: "name, price, rating and 3 more". */
const COUNTED = /^(.+) and (\d{1,4}) more$/u;
/** A list a domain names by all of its fields: "name, price and rating". */
const LISTED = /^(.+), (.+) and (.+)$/u;
/** How many of a list's fields its name says. */
const NAMED = 2;
/** A list whose name names all of its fields at this many or fewer is named in full: "name, price and rating". */
const WHOLE = 3;

/**
 * The name of a list a read reads, by exactly two of its fields and how many
 * more when it has more than two: "name, price and 4 more" for the domain's
 * "name, price, rating and 3 more". A name that already names every field
 * of a list of three or fewer ("name, price and rating"), or of no list shape,
 * is kept as it is: "name, price and 1 more" is longer and says less (lead,
 * t277).
 *
 * One list read went by three names in live run `run-muwansvz-a2b4a987`
 * (R2-U-8): the overlay's "name, price, rating and 3 more", the build card's
 * "name, price and 4 more" and the test card's "name and 5 more", each client
 * shortening it to its own room. Core names it once, short enough for a card,
 * for a build's read and a test's alike, so the overlay and the card agree.
 */
export function automationStudioActivityListName(name: string): string {
  const counted = COUNTED.exec(name);
  const listed = counted ? undefined : LISTED.exec(name);
  const fields = counted ? counted[1]!.split(", ") : listed ? [...listed[1]!.split(", "), listed[2]!, listed[3]!] : [];
  const total = fields.length + (counted ? Number(counted[2]) : 0);
  if (total <= NAMED || fields.length < NAMED || (!counted && total <= WHOLE)) return name;
  return `${fields.slice(0, NAMED).join(", ")} and ${total - NAMED} more`;
}
