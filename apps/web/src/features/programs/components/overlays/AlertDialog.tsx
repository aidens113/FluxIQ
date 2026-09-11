"use client";

import { Button } from "../controls";
import { Modal } from "./Modal";

export function AlertDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  objectLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <Modal busy={Boolean(props.busy)} closeOnEscape={!props.busy} description={props.description} dialogRole="alertdialog" title={props.title} onClose={props.onCancel}>
      {props.objectLabel ? <div className="dialog-object-label"><strong>{props.objectLabel}</strong></div> : null}
      <div className="modal-actions">
        <Button disabled={props.busy} onClick={props.onCancel}>Cancel</Button>
        <Button busy={Boolean(props.busy)} data-modal-submit onClick={props.onConfirm} variant={props.danger ? "danger" : "primary"}>{props.confirmLabel}</Button>
      </div>
    </Modal>
  );
}
