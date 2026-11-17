/** What Data shows while the tables load: rows the shape of real ones, so the page does not jump when they arrive. */
export function DataSkeleton() {
  return (
    <div className="data-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Loading your data…</span>
      <ul aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="data-skeleton-row">
            <span className="data-skeleton-line" data-size="wide" />
            <span className="data-skeleton-line" data-size="narrow" />
          </li>
        ))}
      </ul>
    </div>
  );
}
