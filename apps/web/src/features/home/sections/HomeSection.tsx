import type { ReactNode } from "react";
import type { Resource } from "../data";

export type HomeSectionProps<T> = {
  /** Used for the heading's id, so the region is named by it. */
  id: string;
  title: string;
  resource: Resource<T>;
  /** Plain words for when the section could not be read, such as "Could not reach the engine." */
  errorText: string;
  /** Plain words for when there is nothing to show, such as "No runs yet today." */
  emptyText: string;
  isEmpty: (data: T) => boolean;
  render: (data: T) => ReactNode;
  /** A link or button at the top right of the section, such as "All runs". */
  action?: ReactNode;
};

/** One section of Home: a named region that loads on its own and says in plain words when it is empty or could not be read. */
export function HomeSection<T>(props: HomeSectionProps<T>) {
  const headingId = `home-${props.id}-heading`;
  const resource = props.resource;
  return (
    <section className="home-section" aria-labelledby={headingId} aria-busy={resource.state === "loading"}>
      <div className="home-section-head">
        <h2 id={headingId}>{props.title}</h2>
        {props.action}
      </div>
      {resource.state === "loading" ? <p className="home-note" role="status">Loading…</p> : null}
      {resource.state === "error" ? <p className="home-note home-error" role="alert">{props.errorText}</p> : null}
      {resource.state === "ready" ? (props.isEmpty(resource.data) ? <p className="home-note">{props.emptyText}</p> : props.render(resource.data)) : null}
    </section>
  );
}
