export default function ProgramLoading() {
  return (
    <main className="console-main single-program">
      <div aria-live="polite" className="program-route-loading" role="status">
        <span />
        <strong>Loading program</strong>
      </div>
    </main>
  );
}
