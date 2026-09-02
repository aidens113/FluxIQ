"use client";

import { Field, Modal } from "../../programs/shared-ui";
import { recordingDialogCopy, type RecordingActionKind } from "./recording-model";

export function RecordingActionDialog(props: {
  busy: boolean;
  error: string;
  kind: RecordingActionKind;
  pin: string;
  value: string;
  onCancel(): void;
  onPin(value: string): void;
  onSubmit(): void;
  onValue(value: string): void;
}) {
  const copy = recordingDialogCopy(props.kind);
  return (
    <Modal busy={props.busy} closeOnEscape={!props.busy} description={copy.description} title={copy.title} onClose={props.onCancel}>
      <RecordingActionDialogContent {...props} />
    </Modal>
  );
}

export function RecordingActionDialogContent(props: Parameters<typeof RecordingActionDialog>[0]) {
  const copy = recordingDialogCopy(props.kind);
  return <>
      <div className="dialog-form">
        {props.error ? <p className="automation-runtime-message" role="alert">{props.error}</p> : null}
        {copy.fieldLabel ? <Field {...(props.error && !props.value.trim() ? { error: props.error } : {})} label={copy.fieldLabel} required>{props.kind === "note" ? <textarea data-autofocus rows={4} value={props.value} onChange={(event) => props.onValue(event.target.value)} /> : <input data-autofocus value={props.value} onChange={(event) => props.onValue(event.target.value)} />}</Field> : null}
        <Field {...(props.error && props.value.trim() ? { error: props.error } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" data-autofocus={!copy.fieldLabel} inputMode="numeric" value={props.pin} onChange={(event) => props.onPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></Field>
      </div>
      <div className="modal-actions">
        <button className="button" disabled={props.busy} onClick={props.onCancel} type="button">Cancel</button>
        <button className={props.kind === "delete" ? "button danger" : "button button-primary"} data-modal-submit disabled={props.busy || props.pin.length < 4 || Boolean(copy.fieldLabel && !props.value.trim())} onClick={props.onSubmit} type="button">{props.busy ? "Working..." : copy.action}</button>
      </div>
    </>;
}
