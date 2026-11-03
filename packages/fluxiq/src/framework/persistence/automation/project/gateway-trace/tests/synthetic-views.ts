// Test support: a deterministic stream of event texts shaped like P2's traces.
// Each text is a raw action result or state update carrying a whole view of
// one of six screens (50-900 KB of JSON); a screen changes a little from one
// command to the next (a few counts move, an entry appears or goes), and every
// text has its own command id, revision and time. Seeded, so every run
// measures the same bytes.

type Entry = { ref: string; role: string; label: string; detail: string; price: string; stock: number };
type Screen = { address: string; heading: string; entries: Entry[]; added: number };

const WORDS = ["Lamp", "Desk", "Chair", "Cable", "Kettle", "Shelf", "Rug", "Mirror", "Clock", "Vase", "Stool", "Fan", "Tray", "Mug", "Frame", "Bench"];
const ROLES = ["link", "button", "heading", "text", "listitem", "img", "textbox"];
/** Entries per screen: about 200 bytes each, so 50 KB to 900 KB of JSON. */
const SCREEN_ENTRIES = [250, 900, 1_700, 2_600, 3_500, 4_400];

export function* syntheticViewTexts(count: number, seed = 1): Generator<string> {
  const next = randomSource(seed);
  const screens = SCREEN_ENTRIES.map((size, index) => newScreen(index, size, next));
  for (let index = 0; index < count; index += 1) {
    const screen = screens[Math.floor(next() * screens.length)]!;
    changeSlightly(screen, next);
    yield JSON.stringify({
      type: index % 2 === 0 ? "client.action_result" : "client.state_update",
      commandId: `cmd-${Math.floor(index / 2)}`,
      revision: `rev-${index}-${Math.floor(next() * 1e9).toString(36)}`,
      observedAt: new Date(Date.UTC(2026, 9, 19, 10, 0, 0) + index * 1_350).toISOString(),
      view: { address: screen.address, heading: screen.heading, entries: screen.entries }
    });
  }
}

function newScreen(index: number, size: number, next: () => number): Screen {
  const entries: Entry[] = [];
  for (let position = 0; position < size; position += 1) entries.push(newEntry(`s${index}e${position}`, next));
  return { address: `https://store.example/section-${index}?sort=popular`, heading: `Section ${index}`, entries, added: 0 };
}

function newEntry(ref: string, next: () => number): Entry {
  const word = (): string => WORDS[Math.floor(next() * WORDS.length)]!;
  return {
    ref,
    role: ROLES[Math.floor(next() * ROLES.length)]!,
    label: `${word()} ${word()} ${Math.floor(next() * 1000)}`,
    detail: `${word()} and ${word()}, ${Math.floor(next() * 50) + 1} in a pack, ships in ${Math.floor(next() * 9) + 1} days`,
    price: `$${(next() * 300).toFixed(2)}`,
    stock: Math.floor(next() * 40)
  };
}

/** About 0.5% of entries change a count; sometimes an entry appears or goes. */
function changeSlightly(screen: Screen, next: () => number): void {
  const changes = Math.max(1, Math.floor(screen.entries.length * 0.005));
  for (let change = 0; change < changes; change += 1) {
    const entry = screen.entries[Math.floor(next() * screen.entries.length)]!;
    entry.stock = Math.floor(next() * 40);
  }
  if (next() < 0.3) {
    screen.added += 1;
    screen.entries.splice(Math.floor(next() * screen.entries.length), 0, newEntry(`${screen.heading}-new-${screen.added}`, next));
  }
  if (next() < 0.2) screen.entries.splice(Math.floor(next() * screen.entries.length), 1);
}

/** Mulberry32: a small seeded generator, uniform in [0, 1). */
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
