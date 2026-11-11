// A small stand-in for the browser's DOM, for the chat's view tests under
// node. It implements only what `dom/`'s `createElement` and the chat's
// views touch: elements and text nodes, children and moving them,
// attributes, `textContent`, `hidden`, events, and scroll sizes. There is no
// HTML parser, on purpose: a test that finds markup where text was expected
// finds it because a view built an element, not because a string was parsed.
//
// Events: `dispatch` stands for a person's own input, so the event it delivers
// is trusted (`isTrusted: true`) unless the test says otherwise.
// `dispatchUntrusted` and `click()` stand for script: an event a page made
// itself, which a browser always marks `isTrusted: false`.

/** A text node. */
class FakeText {
  parentNode: FakeElement | null = null;
  readonly nodeType = 3;
  constructor(public data: string) {}
  get textContent(): string {
    return this.data;
  }
  set textContent(value: string) {
    this.data = value;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

type FakeNode = FakeElement | FakeText;
type Listener = (event: { type: string; [key: string]: unknown }) => void;

/** An element. */
export class FakeElement {
  parentNode: FakeElement | null = null;
  readonly nodeType = 1;
  readonly childNodes: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly tagName: string;
  id = "";
  className = "";
  hidden = false;
  open = false;
  disabled = false;
  value = "";
  placeholder = "";
  title = "";
  scrollTop = 0;
  scrollHeight = 0;
  clientHeight = 0;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  /** The fake document installed by `withFakeDocument`, as a real element's owner. */
  get ownerDocument(): { activeElement: unknown } {
    return (globalThis as { document?: { activeElement: unknown } }).document ?? { activeElement: null };
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get lastElementChild(): FakeElement | null {
    return this.children[this.children.length - 1] ?? null;
  }
  get isConnected(): boolean {
    return true;
  }
  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }
  set textContent(value: string) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes.length = 0;
    if (value !== "") this.append(value);
  }

  append(...nodes: Array<FakeNode | string>): void {
    for (const node of nodes) this.insertBefore(typeof node === "string" ? new FakeText(node) : node, null);
  }
  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.textContent = "";
    this.append(...nodes);
  }
  insertBefore<T extends FakeNode>(node: T, reference: FakeNode | null): T {
    node.parentNode?.removeChild(node);
    const index = reference === null ? -1 : this.childNodes.indexOf(reference);
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node: FakeNode): void {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  /** A person's input of `type`: trusted unless `fields` says `isTrusted: false`. */
  dispatch(type: string, fields: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, isTrusted: true, ...fields });
  }
  /** An event of `type` made by script (`element.dispatchEvent`): never trusted. */
  dispatchUntrusted(type: string, fields: Record<string, unknown> = {}): void {
    this.dispatch(type, { ...fields, isTrusted: false });
  }
  /** `HTMLElement.click()`: an untrusted click, and none at all on a disabled control, as in a browser. */
  click(): void {
    if (!this.disabled) this.dispatchUntrusted("click");
  }
  focus(): void {}

  /** Every element under this one, depth first. */
  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  /** Tag-name selectors only (`"button"`), which is all the views ask for; anything else fails loudly. */
  querySelectorAll(selector: string): FakeElement[] {
    if (!/^[a-z][a-z0-9-]*$/iu.test(selector)) throw new Error(`fake-dom supports tag-name selectors only, not ${JSON.stringify(selector)}`);
    return this.descendants().filter((element) => element.tagName === selector.toUpperCase());
  }
  /** Every element under this one whose class list has `name`. */
  byClass(name: string): FakeElement[] {
    return this.descendants().filter((element) => element.className.split(/\s+/u).includes(name));
  }
}

/**
 * Runs `body` with the fake as `globalThis.document`, then puts back whatever
 * was there: every test bundle shares one node process, and other tests
 * install fakes of their own.
 */
export async function withFakeDocument(body: () => void | Promise<void>): Promise<void> {
  const target = globalThis as { document?: unknown };
  const before = target.document;
  target.document = {
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => new FakeText(text),
    visibilityState: "visible",
    activeElement: null,
    // A real document takes listeners: the scroll follower listens on it for
    // the person's keys and for a scroll-bar drag released outside the stream.
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
  try {
    await body();
  } finally {
    target.document = before;
  }
}

/** `element` as the fake it is, for a test to look inside. */
export function fake(element: unknown): FakeElement {
  if (!(element instanceof FakeElement)) throw new Error("not a fake element");
  return element;
}
