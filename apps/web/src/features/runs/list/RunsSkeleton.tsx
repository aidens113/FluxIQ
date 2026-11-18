/** What Runs shows while the runs load: rows the shape of real ones, so the page does not jump when they arrive. */
export function RunsSkeleton() {
  return (
    <div className="runs-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Loading your runs…</span>
      <ul aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="runs-skeleton-row">
            <span className="runs-skeleton-line" data-size="wide" />
            <span className="runs-skeleton-line" data-size="narrow" />
          </li>
        ))}
      </ul>
    </div>
  );
}
