// The one DOM builder every panel view uses.
//
// Views build their own markup (the HTML pages are stubs), so this keeps the
// building terse without a framework: a tag, a few common properties, and
// children. Text goes in through `textContent` only; nothing here parses HTML,
// so no string from the background or the page can become markup.

/** A child is an element or plain text. */
export type ElementChild = Node | string;

/** The properties a view sets most often; anything else goes through `attrs`. */
export type ElementOptions = {
  id?: string;
  className?: string;
  text?: string;
  hidden?: boolean;
  /** Set with `setAttribute`: `type`, `role`, `aria-*`, `title`, `placeholder`, `data-*`. */
  attrs?: Readonly<Record<string, string>>;
};

/** Creates `<tag>` with `options` applied and `children` appended in order. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly ElementChild[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.id !== undefined) element.id = options.id;
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.hidden !== undefined) element.hidden = options.hidden;
  for (const [name, value] of Object.entries(options.attrs ?? {})) element.setAttribute(name, value);
  element.append(...children);
  return element;
}
