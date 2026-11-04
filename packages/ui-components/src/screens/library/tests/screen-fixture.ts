// Shared by the library's screen tests: a screen over the made-up library on the fake DOM, with what a person
// can press and read found by their words.
import { FakeElement, fake } from "../../../testing/index.ts";
import { createFakeSubflowLibraryPort, fakeSubflowCards } from "../../../testing/library/index.ts";
import { createLibraryScreen, type LibraryScreen } from "../index.ts";

export const NOW = new Date(2026, 10, 4, 12).getTime();

/** The screen, its port, and every sentence the host was asked to put in the composer. */
export function openLibrary(options: Parameters<typeof createFakeSubflowLibraryPort>[0] = {}) {
  const port = createFakeSubflowLibraryPort({ now: NOW, ...options });
  const asked: string[] = [];
  const screen: LibraryScreen = createLibraryScreen({ port, host: { askAbout: (text) => asked.push(text) }, now: () => NOW });
  return { port, screen, asked, cards: fakeSubflowCards(NOW) };
}

/** Lets reads and runs the screen started settle. */
export const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

export const root = (screen: LibraryScreen): FakeElement => fake(screen.element);

export const buttons = (screen: LibraryScreen): FakeElement[] => root(screen).querySelectorAll("button");

/** The button whose words begin with `words`. */
export function pressable(screen: LibraryScreen, words: string): FakeElement {
  const found = buttons(screen).find((button) => button.textContent.startsWith(words));
  if (found === undefined) throw new Error(`no button "${words}" among ${buttons(screen).map((button) => JSON.stringify(button.textContent)).join(", ")}`);
  return found;
}

export const press = (screen: LibraryScreen, words: string): void => pressable(screen, words).dispatch("click");

export const has = (screen: LibraryScreen, words: string): boolean => buttons(screen).some((button) => button.textContent.startsWith(words));

export const said = (screen: LibraryScreen): string => root(screen).textContent;

/** Types into the input whose label says `label`. */
export function type(screen: LibraryScreen, label: string, value: string): void {
  const names = root(screen).querySelectorAll("label");
  const at = names.findIndex((name) => name.textContent.startsWith(label));
  const input = root(screen).querySelectorAll("input")[at];
  if (input === undefined) throw new Error(`no field "${label}"`);
  input.value = value;
  input.dispatch("input");
}

export const submit = (screen: LibraryScreen): void => root(screen).querySelectorAll("form")[0]!.dispatch("submit", { preventDefault() {} });

/** Notes which element was given focus last. */
export function watchFocus(): { readonly last: () => FakeElement | undefined; stop(): void } {
  const original = FakeElement.prototype.focus;
  let last: FakeElement | undefined;
  FakeElement.prototype.focus = function focus(this: FakeElement) {
    last = this;
  };
  return { last: () => last, stop: () => void (FakeElement.prototype.focus = original) };
}
