/**
 * The log of what was done. The IAM audit store can be queried inside the engine, but no
 * program or app endpoint reads it yet, so this section says so instead of guessing.
 */
export function ActivitySection() {
  return (
    <section className="security-section" aria-labelledby="security-activity">
      <h2 id="security-activity">Activity</h2>
      <p className="security-note" role="status" data-unavailable="activity">The activity log is not available yet. It will show who did what, whether it was allowed, and when.</p>
    </section>
  );
}
