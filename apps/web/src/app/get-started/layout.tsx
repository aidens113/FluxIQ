import "./get-started.css";

/**
 * Loads the stylesheet for first-run setup's own markup. Like the Studio
 * route, the stylesheet is route-scoped rather than global.
 */
export default function GetStartedLayout(props: Readonly<{ children: React.ReactNode }>) {
  return props.children;
}
