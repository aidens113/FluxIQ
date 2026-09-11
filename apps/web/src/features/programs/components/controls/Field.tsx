"use client";

import { AlertCircle } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type FieldControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean };

export function Field(props: { label: string; children: ReactNode; error?: string; hint?: string; id?: string; required?: boolean }) {
  const generatedId = useId();
  const controlId = props.id ?? `field-${generatedId.replace(/:/g, "")}`;
  const hintId = props.hint ? `${controlId}-hint` : undefined;
  const errorId = props.error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const childDescribedBy = isValidElement<FieldControlProps>(props.children) ? props.children.props["aria-describedby"] : undefined;
  const mergedDescribedBy = [childDescribedBy, describedBy].filter(Boolean).join(" ");
  const controlProps: FieldControlProps = { id: isValidElement<FieldControlProps>(props.children) ? props.children.props.id ?? controlId : controlId };
  if (mergedDescribedBy) controlProps["aria-describedby"] = mergedDescribedBy;
  if (props.error) controlProps["aria-invalid"] = true;
  if (props.required) controlProps["aria-required"] = true;
  const control = isValidElement<FieldControlProps>(props.children)
    ? cloneElement(props.children as ReactElement<FieldControlProps>, controlProps)
    : props.children;
  return (
    <label className={`field${props.error ? " field-error" : ""}`} htmlFor={controlId}>
      <span className="field-label">{props.label}{props.required ? <span aria-hidden> *</span> : null}</span>
      {control}
      {props.hint ? <small className="field-message" id={hintId}>{props.hint}</small> : null}
      {props.error ? <small className="field-message error" id={errorId} role="alert"><AlertCircle size={13} aria-hidden />{props.error}</small> : null}
    </label>
  );
}
