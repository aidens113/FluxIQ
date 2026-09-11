"use client";

import { Button, Field } from "../controls";
import { Modal } from "./Modal";

export type AuthorizationCredentials = { password: string; pin: string; totp: string };
export type AuthorizationRequirements = { password?: boolean; pin?: boolean; totp?: boolean };

export function AuthorizationDialog(props: {
  title: string;
  description: string;
  actionLabel: string;
  credentials: AuthorizationCredentials;
  requirements: AuthorizationRequirements;
  busy?: boolean;
  error?: string;
  onCancel(): void;
  onChange(credentials: AuthorizationCredentials): void;
  onAuthorize(): void;
}) {
  const ready = (!props.requirements.password || Boolean(props.credentials.password))
    && (!props.requirements.pin || props.credentials.pin.length >= 4)
    && (!props.requirements.totp || props.credentials.totp.length === 6);
  return (
    <Modal busy={Boolean(props.busy)} closeOnEscape={!props.busy} description={props.description} title={props.title} onClose={props.onCancel}>
      <div className="dialog-form">
        {props.requirements.password ? <Field {...(props.error ? { error: props.error } : {})} label="Password" required><input autoComplete="current-password" data-autofocus type="password" value={props.credentials.password} onChange={(event) => props.onChange({ ...props.credentials, password: event.target.value })} /></Field> : null}
        {props.requirements.pin ? <Field {...(!props.requirements.password && props.error ? { error: props.error } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" inputMode="numeric" value={props.credentials.pin} onChange={(event) => props.onChange({ ...props.credentials, pin: event.target.value.replace(/\D/g, "").slice(0, 12) })} /></Field> : null}
        {props.requirements.totp ? <Field {...(!props.requirements.password && !props.requirements.pin && props.error ? { error: props.error } : {})} hint="Enter the current six-digit authenticator code." label="Authenticator code" required><input autoComplete="one-time-code" inputMode="numeric" value={props.credentials.totp} onChange={(event) => props.onChange({ ...props.credentials, totp: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field> : null}
      </div>
      <div className="modal-actions">
        <Button disabled={props.busy} onClick={props.onCancel}>Cancel</Button>
        <Button busy={Boolean(props.busy)} data-modal-submit disabled={!ready} onClick={props.onAuthorize} variant="primary">{props.actionLabel}</Button>
      </div>
    </Modal>
  );
}
