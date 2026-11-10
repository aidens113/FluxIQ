import "./run.css";

// The run page shows the existing run detail, attempt story and action log, so
// it loads their Studio view styles (and the state views' for a step's page
// state) with its own page only, as the graph page does for the canvas.
export default function RunPageLayout(props: Readonly<{ children: React.ReactNode }>) {
  return props.children;
}
