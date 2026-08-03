import { Plus, Trash2 } from "lucide-react";
import type { AutomationNodeParameter } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";

export function AutomationNodeParameterEditor(props: {
  node: {
    nodeDefinitionId?: string;
    description?: string;
    customDescription?: string;
    parameters?: AutomationNodeParameter[];
    parameterValues?: JsonObject;
  };
  onChange(parameterValues: JsonObject): void;
  onDescriptionChange(customDescription: string): void;
}) {
  const parameters = props.node.parameters ?? [];
  const values = props.node.parameterValues ?? {};
  const setValue = (parameter: AutomationNodeParameter, value: unknown) => {
    props.onChange({ ...values, [parameter.id]: value });
  };
  return (
    <details className="automation-inspector-section automation-node-parameters" open>
      <summary>Parameters</summary>
      <div className="automation-parameter-stack">
        <label className="automation-parameter-field">
          <span>Node description</span>
          <textarea
            className="automation-description-input"
            placeholder={props.node.description ?? "Describe what this node does in this flow"}
            value={props.node.customDescription ?? ""}
            onChange={(event) => props.onDescriptionChange(event.target.value)}
          />
        </label>
        {parameters.length ? parameters.map((parameter) => (
          <AutomationNodeParameterField
            key={parameter.id}
            parameter={parameter}
            value={values[parameter.id] ?? parameter.defaultValue}
            onChange={(value) => setValue(parameter, value)}
          />
        )) : <span className="muted-text">This node has no editable parameters.</span>}
      </div>
    </details>
  );
}

function AutomationNodeParameterField(props: { parameter: AutomationNodeParameter; value: unknown; onChange(value: unknown): void }) {
  const parameter = props.parameter;
  const value = props.value;
  if (parameter.options?.length) {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <select value={String(value ?? "")} onChange={(event) => props.onChange(event.target.value)}>
          {parameter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </label>
    );
  }
  if (parameter.valueType === "boolean") {
    return (
      <label className="automation-parameter-field checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => props.onChange(event.target.checked)} />
        <span>{parameter.label}{parameter.required ? " *" : ""}{parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}</span>
      </label>
    );
  }
  if (parameter.valueType === "number") {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <input type="number" value={String(value ?? 0)} onChange={(event) => props.onChange(Number(event.target.value))} />
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </label>
    );
  }
  if (parameter.valueType === "object" || parameter.valueType === "json") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationObjectParameterEditor value={value} onChange={props.onChange} />
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </div>
    );
  }
  if (parameter.valueType === "array") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationArrayParameterEditor value={value} onChange={props.onChange} />
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </div>
    );
  }
  if (parameter.valueType === "any" || parameter.ui?.control === "value") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationTypedValueParameterEditor value={value} onChange={props.onChange} />
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </div>
    );
  }
  if (parameter.ui?.control === "textarea") {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <textarea value={String(value ?? "")} placeholder={parameter.ui.placeholder} onChange={(event) => props.onChange(event.target.value)} />
        {parameter.description ? <small className="automation-parameter-help">{parameter.description}</small> : null}
      </label>
    );
  }
  return (
    <AutomationStringParameterField parameter={parameter} value={value} onChange={props.onChange} />
  );
}

function AutomationStringParameterField(props: { parameter: AutomationNodeParameter; value: unknown; onChange(value: string): void }) {
  const ui = props.parameter.ui;
  const controlLabel = automationParameterControlLabel(props.parameter);
  return (
    <label className={`automation-parameter-field automation-string-control ${ui?.control ?? "text"}`}>
      <span>{props.parameter.label}{props.parameter.required ? " *" : ""}</span>
      <div className="automation-string-input-wrap">
        <input value={String(props.value ?? "")} placeholder={ui?.placeholder ?? controlLabel} onChange={(event) => props.onChange(event.target.value)} />
        <small>{controlLabel}</small>
      </div>
      {props.parameter.description ? <small className="automation-parameter-help">{props.parameter.description}</small> : null}
    </label>
  );
}

function AutomationTypedValueParameterEditor(props: { value: unknown; onChange(value: unknown): void }) {
  const kind = automationTypedValueKind(props.value);
  return (
    <div className="automation-typed-value-editor">
      <select
        aria-label="Value type"
        value={kind}
        onChange={(event) => props.onChange(defaultAutomationTypedValue(event.target.value))}
      >
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="boolean">Boolean</option>
        <option value="empty">Empty</option>
      </select>
      {kind === "boolean" ? (
        <select aria-label="Boolean value" value={String(Boolean(props.value))} onChange={(event) => props.onChange(event.target.value === "true")}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : kind === "empty" ? (
        <input aria-label="Empty value" value="No value" disabled />
      ) : (
        <input
          aria-label="Value"
          type={kind === "number" ? "number" : "text"}
          value={String(props.value ?? "")}
          onChange={(event) => props.onChange(kind === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
    </div>
  );
}

function AutomationObjectParameterEditor(props: { value: unknown; onChange(value: JsonObject): void }) {
  const entries = Object.entries(automationObjectParameterValue(props.value));
  const updateEntry = (index: number, key: string, value: unknown) => {
    const nextEntries: Array<[string, unknown]> = entries.map(([entryKey, entryValue], entryIndex) => entryIndex === index ? [key, automationCoercedParameterValue(value)] : [entryKey, entryValue]);
    props.onChange(Object.fromEntries(nextEntries.filter(([entryKey]) => entryKey.trim())));
  };
  const removeEntry = (index: number) => props.onChange(Object.fromEntries(entries.filter((_entry, entryIndex) => entryIndex !== index)));
  return (
    <div className="automation-structured-parameter">
      {entries.map(([key, entryValue], index) => (
        <div className="automation-structured-row" key={`${key}-${index}`}>
          <input aria-label="Field name" placeholder="Field" value={key} onChange={(event) => updateEntry(index, event.target.value, entryValue)} />
          <input aria-label="Field value" placeholder="Value" value={automationParameterPrimitiveText(entryValue)} onChange={(event) => updateEntry(index, key, event.target.value)} />
          <button className="icon-button" onClick={() => removeEntry(index)} title="Remove field" aria-label="Remove field" type="button"><Trash2 size={12} aria-hidden /></button>
        </div>
      ))}
      <button className="secondary-button compact" onClick={() => props.onChange({ ...automationObjectParameterValue(props.value), field: "" })} type="button">
        <Plus size={13} aria-hidden /> Add field
      </button>
    </div>
  );
}

function AutomationArrayParameterEditor(props: { value: unknown; onChange(value: unknown[]): void }) {
  const values = Array.isArray(props.value) ? props.value : [];
  const updateItem = (index: number, value: unknown) => props.onChange(values.map((item, itemIndex) => itemIndex === index ? automationCoercedParameterValue(value) : item));
  const removeItem = (index: number) => props.onChange(values.filter((_item, itemIndex) => itemIndex !== index));
  return (
    <div className="automation-structured-parameter">
      {values.map((item, index) => (
        typeof item === "object" && item !== null && !Array.isArray(item) ? (
          <div className="automation-array-object" key={index}>
            <AutomationObjectParameterEditor value={item} onChange={(value) => updateItem(index, value)} />
            <button className="secondary-button compact danger" onClick={() => removeItem(index)} type="button"><Trash2 size={12} aria-hidden /> Remove item</button>
          </div>
        ) : (
          <div className="automation-structured-row" key={index}>
            <input aria-label="Item value" placeholder="Value" value={automationParameterPrimitiveText(item)} onChange={(event) => updateItem(index, event.target.value)} />
            <button className="icon-button" onClick={() => removeItem(index)} title="Remove item" aria-label="Remove item" type="button"><Trash2 size={12} aria-hidden /></button>
          </div>
        )
      ))}
      <button className="secondary-button compact" onClick={() => props.onChange([...values, {}])} type="button">
        <Plus size={13} aria-hidden /> Add item
      </button>
    </div>
  );
}

function automationObjectParameterValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function automationParameterControlLabel(parameter: AutomationNodeParameter): string {
  switch (parameter.ui?.control) {
    case "reference":
      switch (parameter.ui.referenceType) {
        case "action": return "Action picker";
        case "task": return "Task picker";
        case "policy": return "Policy picker";
        case "routine": return "Routine picker";
        case "database-collection": return "Collection picker";
        case "variable": return "Variable picker";
        default: return "Reference picker";
      }
    case "identifier": return "Identifier";
    case "path": return "Object path";
    case "field": return "Field";
    case "textarea": return "Long text";
    case "value": return "Typed value";
    default: return "Text";
  }
}

function automationTypedValueKind(value: unknown): "text" | "number" | "boolean" | "empty" {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function defaultAutomationTypedValue(kind: string): unknown {
  switch (kind) {
    case "number": return 0;
    case "boolean": return false;
    case "empty": return null;
    default: return "";
  }
}

function automationParameterPrimitiveText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return shortJson(value);
  return String(value);
}

function automationCoercedParameterValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;
  return value;
}

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}
