"use client";

export function Segmented(props: { value: string; options: string[]; onChange(value: string): void; label?: string }) {
  return (
    <div aria-label={props.label ?? "Options"} className="segmented-control" role="group">
      {props.options.map((option) => (
        <button aria-pressed={props.value === option} className={props.value === option ? "selected" : ""} key={option} onClick={() => props.onChange(option)} type="button">
          {option}
        </button>
      ))}
    </div>
  );
}
