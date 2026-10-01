import { type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field } from "../Field";

function association(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const labelFor = html.match(/<label\b[^>]*\bfor="([^"]*)"/u)?.[1];
  const control = html.match(/<(?:input|select|textarea)\b[^>]*>/u)?.[0] ?? "";
  const id = control.match(/\bid="([^"]*)"/u)?.[1];
  const described = control.match(/\baria-describedby="([^"]*)"/u)?.[1]?.split(" ") ?? [];
  return { html, labelFor, control, id, described };
}
describe("Field native associations", () => {
  it.each([undefined, "wrapper-id"])("existing direct child ID owns label and messages with wrapper %s", wrapper => {
    const result = association(<Field {...(wrapper === undefined ? {} : { id: wrapper })} label="Account" hint="Help" error="Invalid"><input id="native-id" aria-describedby="caller-help" /></Field>);
    expect(result.id).toBe("native-id"); expect(result.labelFor).toBe(result.id); expect(result.described).toEqual(["caller-help", "native-id-hint", "native-id-error"]);
    expect(result.html).toContain('id="native-id-hint"'); expect(result.html).toContain('id="native-id-error"'); expect(result.control).toContain('aria-invalid="true"');
  });
  it("wrapper ID associates a child without its own ID", () => {
    const result = association(<Field id="wrapper-id" label="Account" hint="Help"><input /></Field>); expect(result.id).toBe("wrapper-id"); expect(result.labelFor).toBe(result.id); expect(result.described).toEqual(["wrapper-id-hint"]);
  });
  it("generated IDs associate controls and messages and remain unique together", () => {
    const html = renderToStaticMarkup(<div><Field label="First" hint="First help"><input /></Field><Field label="Second" error="Second error"><textarea /></Field></div>);
    const labels = [...html.matchAll(/<label\b[^>]*\bfor="([^"]*)"/gu)].map(match => match[1]); const ids = [...html.matchAll(/<(?:input|textarea)\b[^>]*\bid="([^"]*)"/gu)].map(match => match[1]);
    expect(labels).toHaveLength(2); expect(new Set(ids).size).toBe(2); expect(labels).toEqual(ids); expect(html).toContain(`id="${ids[0]}-hint"`); expect(html).toContain(`id="${ids[1]}-error"`);
  });
  it.each(["input", "select", "textarea"])("direct %s ID is preserved", tag => {
    const child = tag === "select" ? <select id="native-id"><option>One</option></select> : tag === "textarea" ? <textarea id="native-id" /> : <input id="native-id" />;
    const result = association(<Field id="wrapper-id" label="Control">{child}</Field>); expect(result.id).toBe("native-id"); expect(result.labelFor).toBe(result.id);
  });
  it.each([undefined, "Hint"])("caller description and native aria states survive absent overrides, hint=%s", hint => {
    const result = association(<Field label="Name" {...(hint === undefined ? {} : { hint })}><input aria-describedby="caller-help caller-extra" aria-invalid aria-required /></Field>);
    expect(result.described.slice(0, 2)).toEqual(["caller-help", "caller-extra"]); expect(result.control).toContain('aria-invalid="true"'); expect(result.control).toContain('aria-required="true"');
    if (hint) expect(result.described.at(-1)).toBe(`${result.id}-hint`); else expect(result.described).toHaveLength(2);
  });
  it("false native aria states remain false unless wrapper supplies real validation", () => {
    const plain = association(<Field label="Name"><input aria-invalid={false} aria-required={false} /></Field>); expect(plain.control).toContain('aria-invalid="false"'); expect(plain.control).toContain('aria-required="false"');
    const required = association(<Field label="Name" required error="Required"><input aria-invalid={false} aria-required={false} /></Field>); expect(required.control).toContain('aria-invalid="true"'); expect(required.control).toContain('aria-required="true"'); expect(required.html).toContain('role="alert"');
  });
  it("hint/error replacement tracks current effective child ID without orphan references", () => {
    const before = association(<Field id="wrapper-id" label="Name" hint="Help" error="Error"><input id="native-id" /></Field>);
    const after = association(<Field id="wrapper-id" label="Name" hint="Help"><input id="native-id" /></Field>); expect(before.described).toEqual(["native-id-hint", "native-id-error"]); expect(after.described).toEqual(["native-id-hint"]); expect(after.html).not.toContain("native-id-error");
  });
  it("direct custom control forwards effective ID and association props", () => {
    function CustomControl(props: ComponentProps<"input">) { return <input {...props} />; }
    const result = association(<Field id="wrapper-id" label="Custom" hint="Help"><CustomControl id="custom-id" aria-describedby="caller-help" /></Field>);
    expect(result.id).toBe("custom-id"); expect(result.labelFor).toBe(result.id); expect(result.described).toEqual(["caller-help", "custom-id-hint"]);
  });
  it("multiple children remain caller-owned controls without recursive transformation", () => {
    const html = renderToStaticMarkup(<Field label="Group">{[<input id="first" key="first" />, <input id="second" key="second" />]}</Field>);
    expect(html).toContain('id="first"'); expect(html).toContain('id="second"'); expect(html.match(/<input/gu)).toHaveLength(2);
  });
});
