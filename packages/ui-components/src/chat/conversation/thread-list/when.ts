// When a thread last moved, in the words the conversation list shows: "just
// now", "5 min ago", "3 h ago", "yesterday", "4 days ago", and past a week the
// day ("Nov 3", with the year when it is not this one). `date` is the full day
// ("November 3, 2026"), for the row's hover and so a search by date finds it.
// English words, like every word the chat says; the local calendar decides
// what "yesterday" is.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A thread's time in words. */
export type ThreadWhen = { when: string; date: string };

/** How long ago `updatedAt` was at `now`, both in ms since the epoch. */
export function threadWhen(updatedAt: number, now: number): ThreadWhen {
  const at = new Date(updatedAt);
  const today = new Date(now);
  const month = MONTHS[at.getMonth()]!;
  const date = `${month} ${at.getDate()}, ${at.getFullYear()}`;
  const ago = now - updatedAt;
  if (ago < MINUTE) return { when: "just now", date };
  if (ago < HOUR) return { when: `${Math.floor(ago / MINUTE)} min ago`, date };
  const days = Math.round((startOfDay(today) - startOfDay(at)) / DAY);
  if (days <= 0) return { when: `${Math.floor(ago / HOUR)} h ago`, date };
  if (days === 1) return { when: "yesterday", date };
  if (days < 7) return { when: `${days} days ago`, date };
  const day = `${month.slice(0, 3)} ${at.getDate()}`;
  return { when: at.getFullYear() === today.getFullYear() ? day : `${day}, ${at.getFullYear()}`, date };
}

function startOfDay(moment: Date): number {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
}
