/** What every view of the screen is given: the clock, and a way to say which element a press on a row should bring focus back to. */
export type LibraryViewContext = {
  now: () => number;
  /** Notes an element a person can come back to, by a key the screen remembers. */
  register(key: string, element: HTMLElement): void;
};
