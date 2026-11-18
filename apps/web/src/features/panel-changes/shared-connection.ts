import { browserPanelChangeSources } from "./browser-sources";
import { PanelChangeConnection } from "./connection";

let shared: PanelChangeConnection | undefined;

/** The page's one change connection, made on first use. Every reader shares it, so the page holds one stream. */
export function sharedPanelChanges(): PanelChangeConnection {
  shared ??= new PanelChangeConnection(browserPanelChangeSources());
  return shared;
}
