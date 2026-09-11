"use client";

export function Progress(props: { label: string; value?: number; detail?: string }) {
  const value = props.value === undefined ? undefined : Math.max(0, Math.min(100, props.value));
  return (
    <div className="progress">
      <div><strong>{props.label}</strong>{props.detail ? <span>{props.detail}</span> : null}{value !== undefined ? <output>{Math.round(value)}%</output> : null}</div>
      <div aria-label={props.label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={value === undefined ? undefined : Math.round(value)} className={value === undefined ? "progress-bar indeterminate" : "progress-bar"} role="progressbar">
        <span style={value === undefined ? undefined : { width: `${value}%` }} />
      </div>
    </div>
  );
}
