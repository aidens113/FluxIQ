import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordValueType
} from "fluxiq/automation-studio/nodes";
import { FieldHandlingControl } from "./FieldHandlingControl";
import {
  moveRecordField,
  removeRecordField,
  setRecordFieldHandling,
  setRecordPrimaryKey,
  updateRecordField
} from "./record-output-draft";

const VALUE_TYPE_LABELS: Readonly<Record<AutomationStudioRecordValueType, string>> = {
  string: "Text",
  number: "Number",
  boolean: "Yes/No",
  url: "Link",
  datetime: "Date and time",
  json: "JSON"
};

/** One field of a record output: name, id, value type, required, key, handling, order, and removal. */
export function RecordFieldRow(props: {
  output: AutomationStudioRecordOutput;
  index: number;
  onChange(output: AutomationStudioRecordOutput): void;
}) {
  const fields = props.output.schema.fields;
  const field = fields[props.index];
  if (!field) return null;
  const number = props.index + 1;
  const handling = field.handling ?? "include";
  const isKey = props.output.schema.primaryKey?.includes(field.id) ?? false;
  return (
    <fieldset className="automation-structured-parameter automation-record-field">
      <legend>Field {number}</legend>
      <label className="automation-parameter-field">
        <span>Name *</span>
        <input
          aria-label={`Field ${number} name`}
          maxLength={AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.labelMaxLength}
          onChange={(event) => props.onChange(updateRecordField(props.output, props.index, { label: event.target.value }))}
          value={field.label}
        />
      </label>
      <label className="automation-parameter-field">
        <span>Id *</span>
        <input
          aria-label={`Field ${number} id`}
          onChange={(event) => props.onChange(updateRecordField(props.output, props.index, { id: event.target.value }))}
          value={field.id}
        />
        <small className="automation-parameter-help">Follows the name until you change it. Letters, numbers, dashes, or underscores.</small>
      </label>
      <label className="automation-parameter-field">
        <span>Value type</span>
        <select
          aria-label={`Field ${number} value type`}
          onChange={(event) => {
            const valueType = AUTOMATION_STUDIO_RECORD_VALUE_TYPES.find((type) => type === event.target.value);
            if (valueType) props.onChange(updateRecordField(props.output, props.index, { valueType }));
          }}
          value={field.valueType}
        >
          {AUTOMATION_STUDIO_RECORD_VALUE_TYPES.map((type) => <option key={type} value={type}>{VALUE_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
      <label className="automation-parameter-field checkbox">
        <input
          aria-label={`Field ${number} required`}
          checked={field.required === true}
          onChange={(event) => props.onChange(updateRecordField(props.output, props.index, { required: event.target.checked }))}
          type="checkbox"
        />
        <span>Required<small className="automation-parameter-help">A row without this value is not saved.</small></span>
      </label>
      <label className="automation-parameter-field checkbox">
        <input
          aria-label={`Field ${number} is the key`}
          checked={isKey}
          disabled={handling !== "include"}
          onChange={(event) => props.onChange(setRecordPrimaryKey(props.output, event.target.checked ? field.id : null))}
          type="checkbox"
        />
        <span>Key<small className="automation-parameter-help">The one field that identifies a row. Only an included column can be the key.</small></span>
      </label>
      <FieldHandlingControl
        label={`Field ${number} handling`}
        onChange={(next) => props.onChange(setRecordFieldHandling(props.output, props.index, next))}
        value={handling}
      />
      <div className="automation-record-field-actions">
        <button
          aria-label={`Move field ${number} up`}
          className="icon-button"
          disabled={props.index === 0}
          onClick={() => props.onChange(moveRecordField(props.output, props.index, -1))}
          title="Move up"
          type="button"
        >
          <ArrowUp size={12} aria-hidden />
        </button>
        <button
          aria-label={`Move field ${number} down`}
          className="icon-button"
          disabled={props.index === fields.length - 1}
          onClick={() => props.onChange(moveRecordField(props.output, props.index, 1))}
          title="Move down"
          type="button"
        >
          <ArrowDown size={12} aria-hidden />
        </button>
        <button
          aria-label={`Remove field ${number}`}
          className="icon-button"
          onClick={() => props.onChange(removeRecordField(props.output, props.index))}
          title="Remove field"
          type="button"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>
    </fieldset>
  );
}
