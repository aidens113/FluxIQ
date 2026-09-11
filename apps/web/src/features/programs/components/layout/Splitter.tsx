"use client";

import type { ButtonHTMLAttributes } from "react";

export function Splitter(props: {
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  onReset?(): void;
  onPointerDown?: ButtonHTMLAttributes<HTMLButtonElement>["onPointerDown"];
}) {
  const step = props.step ?? 1;
  const clamp = (value: number) => Math.max(props.min, Math.min(props.max, value));
  return (
    <button
      aria-label={props.label}
      aria-orientation={props.orientation}
      aria-valuemax={props.max}
      aria-valuemin={props.min}
      aria-valuenow={Math.round(props.value)}
      aria-valuetext={`${Math.round(props.value)} percent`}
      className={`splitter ${props.orientation}`}
      onDoubleClick={props.onReset}
      onKeyDown={(event) => {
        const decrease = props.orientation === "vertical" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
        const increase = props.orientation === "vertical" ? event.key === "ArrowRight" : event.key === "ArrowDown";
        if (decrease || increase) {
          event.preventDefault();
          props.onChange(clamp(props.value + (increase ? 1 : -1) * step * (event.shiftKey ? 10 : 1)));
        } else if (event.key === "Home") {
          event.preventDefault();
          props.onChange(props.min);
        } else if (event.key === "End") {
          event.preventDefault();
          props.onChange(props.max);
        } else if (event.key === "Enter" && props.onReset) {
          event.preventDefault();
          props.onReset();
        }
      }}
      onPointerDown={props.onPointerDown}
      role="separator"
      title={props.onReset ? `${props.label}. Double-click or press Enter to reset.` : props.label}
      type="button"
    ><span aria-hidden /></button>
  );
}
