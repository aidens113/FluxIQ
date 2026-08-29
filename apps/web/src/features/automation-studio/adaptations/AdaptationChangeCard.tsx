import { JsonToggle } from "../runtime";
import {
  adaptationChangedFields,
  adaptationObjectTarget,
  type AdaptationObjectTarget
} from "./adaptation-model";

export function AdaptationTargetAction(props: {
  target: AdaptationObjectTarget;
  onOpenTarget?(target: AdaptationObjectTarget): void;
}) {
  return props.onOpenTarget
    ? <button className="automation-runtime-row-action" onClick={() => props.onOpenTarget?.(props.target)} type="button">{props.target.label}</button>
    : <span>{props.target.label}</span>;
}

export function AdaptationChangeCard(props: {
  change: any;
  applied?: boolean;
  onOpenTarget?(target: AdaptationObjectTarget): void;
}) {
  const kind = props.change.kind ?? props.change.patchKind ?? "change";
  const targetId = props.change.targetId ?? props.change.artifactId;
  const target = adaptationObjectTarget(kind, targetId);
  const fields = adaptationChangedFields(props.change.before, props.change.after);

  return (
    <article className="automation-adaptation-change">
      <header>
        <div><strong>{String(kind).replace(/_/g, " ")}</strong><span>{props.change.summary ?? (props.applied ? "Durable mutation" : "Planned change")}</span></div>
        <AdaptationTargetAction target={target} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />
      </header>
      <div className="automation-adaptation-change-target"><span>Target</span><strong>{targetId ?? (kind === "create_subflow" ? "New subflow" : "Owning Flow")}</strong></div>
      {fields.length ? <div className="automation-adaptation-diff" role="table" aria-label="Changed fields">
        <div role="row"><span role="columnheader">Field</span><span role="columnheader">Previous</span><span role="columnheader">New</span></div>
        {fields.map((field) => <div key={field.path} role="row"><strong role="cell">{field.path}</strong><span role="cell">{field.before}</span><span role="cell">{field.after}</span></div>)}
      </div> : <p className="automation-adaptation-copy">No field-level values were recorded for this change.</p>}
      <JsonToggle label="Technical change details" value={{ before: props.change.before, after: props.change.after, metadata: props.change.metadata }} />
    </article>
  );
}
