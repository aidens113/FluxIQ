"use client";

export function SummaryStrip(props: { items: Array<[string, string | number]> }) {
  return (
    <div className="summary-strip">
      {props.items.map(([label, value], index) => (
        <div key={`${label}:${index}`}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
