"use client";

export function KeyValue(props: { rows: Array<[string, string]> }) {
  return (
    <dl className="key-value-list">
      {props.rows.map(([key, value], index) => (
        <div key={`${key}:${index}`}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
