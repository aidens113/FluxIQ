import { Info } from "lucide-react";
import {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  type AutomationStudioRecordFieldHandling
} from "fluxiq/automation-studio/nodes";
import { Tooltip } from "../../../programs/shared-ui";

const HANDLING_LABELS: Readonly<Record<AutomationStudioRecordFieldHandling, string>> = {
  include: "Include",
  exclude: "Exclude column",
  encrypt: "Encrypt column"
};

// Downstream D12's info hover, in domain-neutral words.
const EXCLUDE_COLUMN_HELP = "Exclude column leaves this column out entirely: its values are never collected, so they are absent from the node's output, the saved table, the preview, and CSV/JSON exports. Use it for private information such as passwords, card numbers, or personal details you don't want collected, saved, or exported. The column stays listed so field detection does not propose it again.";

// Until project record keys exist (K11), the parser refuses `encrypt`
// (`record_schema.encrypt_unavailable`), so the option cannot be chosen.
const ENCRYPT_COLUMN_UNAVAILABLE = "Encrypt column arrives with project record keys";

/** Include / Exclude column / Encrypt column for one record field. */
export function FieldHandlingControl(props: {
  label: string;
  value: AutomationStudioRecordFieldHandling;
  onChange(handling: AutomationStudioRecordFieldHandling): void;
}) {
  return (
    <div className="automation-record-field-handling">
      <div aria-label={props.label} className="automation-segmented-control" role="group">
        {AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS.map((handling) => {
          const unavailable = handling === "encrypt";
          return (
            <button
              aria-pressed={props.value === handling}
              disabled={unavailable}
              key={handling}
              onClick={() => {
                if (!unavailable) props.onChange(handling);
              }}
              title={unavailable ? ENCRYPT_COLUMN_UNAVAILABLE : undefined}
              type="button"
            >
              {HANDLING_LABELS[handling]}
            </button>
          );
        })}
      </div>
      <Tooltip content={EXCLUDE_COLUMN_HELP}>
        <button aria-label="About Exclude column" className="icon-button" type="button"><Info size={12} aria-hidden /></button>
      </Tooltip>
      <Tooltip content={ENCRYPT_COLUMN_UNAVAILABLE}>
        <button aria-label="Why Encrypt column is unavailable" className="icon-button" type="button"><Info size={12} aria-hidden /></button>
      </Tooltip>
    </div>
  );
}
