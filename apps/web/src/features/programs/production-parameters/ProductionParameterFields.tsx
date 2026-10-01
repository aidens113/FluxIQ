"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { prepareProductionParameters } from "./prepareProductionParameters";

export function ProductionParameterFields(props: { schema: unknown; values: Record<string, string>; onChange(values: Record<string, string>): void }) {
  const prefix = useId();
  const latest = useRef(props); latest.current = props;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const prepared = prepareProductionParameters(props.schema, props.values);
  const update = (name: string, value: string | undefined) => {
    if (!mounted.current || latest.current !== props) return;
    const next = { ...props.values };
    if (value === undefined) delete next[name];
    else Object.defineProperty(next, name, { value, writable: true, enumerable: true, configurable: true });
    props.onChange(next);
  };
  return <div className="production-parameter-grid">
    {prepared.issues.filter((issue) => issue.field === undefined).map((issue, index) => <p role="alert" key={index}>{issue.message}</p>)}
    {prepared.fields.map((field, index) => {
      const id = `${prefix}-parameter-${index}`, errorId = `${id}-error`;
      const error = prepared.issues.find((issue) => issue.field === field.name)?.message;
      const accessibility = { id, required: field.required, "aria-invalid": Boolean(error), ...(error ? { "aria-describedby": errorId } : {}) };
      return <div className="field" key={field.name}><label htmlFor={id}>{field.label}{field.required ? " (required)" : ""}</label>
        {field.choices ? <select {...accessibility} value={field.selectedOption === undefined ? "unset" : `option:${field.selectedOption}`} onChange={(event) => {
          const value = event.target.value;
          if (value === "unset") update(field.name, undefined);
          else if (/^option:\d+$/.test(value)) { const option = field.choices?.[Number(value.slice(7))]; if (option !== undefined) update(field.name, String(option)); }
        }}><option value="unset">{Object.prototype.hasOwnProperty.call(field, "defaultValue") ? "Use default" : "Choose a value"}</option>{field.choices.map((choice, option) => <option key={option} value={`option:${option}`}>{choice === "" ? "Empty string" : String(choice)}</option>)}</select>
          : field.type === "boolean" ? <select {...accessibility} value={field.value} onChange={(event) => update(field.name, event.target.value)}><option value="false">No</option><option value="true">Yes</option></select>
          : <input {...accessibility} inputMode={field.type === "number" || field.type === "integer" ? "decimal" : undefined} value={field.value} onChange={(event) => update(field.name, event.target.value)} />}
        {error ? <p id={errorId} role="alert">{error}</p> : null}
      </div>;
    })}
  </div>;
}
