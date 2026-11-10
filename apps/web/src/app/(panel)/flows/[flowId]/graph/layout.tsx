import "@xyflow/react/dist/style.css";
import "./graph.css";

// The graph editor's styles load with its own page only: the canvas library's sheet and the Studio
// view styles the canvas and the step details use. No other panel page carries them.
export default function FlowGraphLayout(props: Readonly<{ children: React.ReactNode }>) {
  return props.children;
}
