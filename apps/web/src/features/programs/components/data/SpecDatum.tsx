"use client";

export function SpecDatum(props: { label: string; value: string }) {
  return (
    <div className="spec-datum">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
