import { Plus } from "lucide-react";
import {
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  type AutomationNodeParameter,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordWriteMode
} from "fluxiq/automation-studio/nodes";
import { RecordFieldRow } from "./RecordFieldRow";
import {
  addRecordField,
  readRecordOutputDraft,
  toggleRecordOutput,
  updateRecordOutputSettings
} from "./record-output-draft";

const WRITE_MODE_LABELS: Readonly<Record<AutomationStudioRecordWriteMode, string>> = {
  append: "Append",
  replace: "Replace"
};

const MAX_RECORDS_DEFAULT = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsDefault;
const MAX_RECORDS_CEILING = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling;
const MAX_FIELDS = AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields;

/**
 * Edits a `record-output` parameter: whether extracted records are saved, the
 * table they are saved to, and its fields. Turning saving off writes `null`.
 * This editor never offers a state binding: a binding could swap the schema,
 * and with it the excluded fields, at run time.
 */
export function RecordOutputEditor(props: {
  parameter: AutomationNodeParameter;
  value: unknown;
  onChange(value: AutomationStudioRecordOutput | null): void;
}) {
  const draft = readRecordOutputDraft(props.value);
  return (
    <div className="automation-structured-parameter automation-record-output-editor">
      <label className="automation-parameter-field checkbox">
        <input
          aria-label={props.parameter.label}
          checked={draft !== null}
          onChange={(event) => props.onChange(toggleRecordOutput(props.value, event.target.checked))}
          role="switch"
          type="checkbox"
        />
        <span>
          {props.parameter.label}
          {props.parameter.description ? <small className="automation-parameter-help">{props.parameter.description}</small> : null}
        </span>
      </label>
      {draft ? <>
        <label className="automation-parameter-field">
          <span>Table id *</span>
          <input
            aria-label="Table id"
            maxLength={200}
            onChange={(event) => props.onChange(updateRecordOutputSettings(draft, { datasetId: event.target.value }))}
            placeholder="products"
            value={draft.datasetId}
          />
          <small className="automation-parameter-help">Letters, numbers, dots, dashes, colons, or underscores.</small>
        </label>
        <label className="automation-parameter-field">
          <span>Table name</span>
          <input
            aria-label="Table name"
            maxLength={AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.labelMaxLength}
            onChange={(event) => props.onChange(updateRecordOutputSettings(draft, { label: event.target.value }))}
            placeholder="Products"
            value={draft.label ?? ""}
          />
        </label>
        <label className="automation-parameter-field">
          <span>Records path *</span>
          <input
            aria-label="Records path"
            maxLength={AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.recordsPathMaxLength}
            onChange={(event) => props.onChange(updateRecordOutputSettings(draft, { recordsPath: event.target.value }))}
            placeholder="items"
            value={draft.recordsPath}
          />
          <small className="automation-parameter-help">Where the list of rows sits inside the node's result, for example items or data.rows.</small>
        </label>
        <label className="automation-parameter-field">
          <span>Write mode</span>
          <select
            aria-label="Write mode"
            onChange={(event) => {
              const writeMode = AUTOMATION_STUDIO_RECORD_WRITE_MODES.find((mode) => mode === event.target.value);
              if (writeMode) props.onChange(updateRecordOutputSettings(draft, { writeMode }));
            }}
            value={draft.writeMode}
          >
            {AUTOMATION_STUDIO_RECORD_WRITE_MODES.map((mode) => <option key={mode} value={mode}>{WRITE_MODE_LABELS[mode]}</option>)}
          </select>
          <small className="automation-parameter-help">Append adds rows to what this run already saved to the table; Replace overwrites them.</small>
        </label>
        <label className="automation-parameter-field">
          <span>Max records</span>
          <input
            aria-label="Max records"
            max={MAX_RECORDS_CEILING}
            min={1}
            onChange={(event) => {
              const text = event.target.value.trim();
              const count = Number(text);
              props.onChange(updateRecordOutputSettings(draft, { maxRecords: text === "" || !Number.isFinite(count) ? null : count }));
            }}
            placeholder={String(MAX_RECORDS_DEFAULT)}
            step={1}
            type="number"
            value={draft.maxRecords === undefined ? "" : String(draft.maxRecords)}
          />
          <small className="automation-parameter-help">
            Rows kept from each capture, 1 to {MAX_RECORDS_CEILING.toLocaleString("en-US")}; {MAX_RECORDS_DEFAULT.toLocaleString("en-US")} when blank.
          </small>
        </label>
        <fieldset className="automation-structured-parameter automation-record-fields">
          <legend>Fields</legend>
          <small className="automation-parameter-help">
            Changing fields changes the table&apos;s columns for later runs; earlier runs keep the columns they were saved with.
          </small>
          {draft.schema.fields.map((field, index) => (
            <RecordFieldRow key={index} index={index} onChange={props.onChange} output={draft} />
          ))}
          {draft.schema.fields.length ? null : <span className="muted-text">No fields yet. Add one for each column a row should have.</span>}
          <button
            className="secondary-button compact"
            disabled={draft.schema.fields.length >= MAX_FIELDS}
            onClick={() => props.onChange(addRecordField(draft))}
            type="button"
          >
            <Plus size={13} aria-hidden /> Add field
          </button>
        </fieldset>
      </> : null}
    </div>
  );
}
