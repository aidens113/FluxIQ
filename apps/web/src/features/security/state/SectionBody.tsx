import type { ReactNode } from "react";
import type { Resource } from "../../home/data";
import type { Guarded } from "../model";

/** One section's loading, error and "no access" states; `children` draws the data. A section never fails the page. */
export function SectionBody<T>(props: { resource: Resource<Guarded<T>>; noun: string; children: (data: T) => ReactNode }) {
  const { resource, noun } = props;
  if (resource.state === "loading") return <p className="security-note" role="status">Loading {noun}…</p>;
  if (resource.state === "error") return <p className="security-note security-error" role="alert">Could not read {noun}. Check that the engine is running, then reload.</p>;
  if (resource.data.state === "denied") return <p className="security-note" role="status">You do not have access to this.</p>;
  return <>{props.children(resource.data.data)}</>;
}
