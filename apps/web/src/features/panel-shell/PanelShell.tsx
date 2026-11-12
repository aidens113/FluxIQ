"use client";

// The panel's frame: the six places (a left rail, a bottom tab bar on a phone),
// the top bar, the page, and the assistant on the right of every page. Pages
// tell the shell where the person is with `PublishPanelPage`.

import type { ReactNode } from "react";
import "./panel-shell.css";
import { PanelContextProvider, type PanelPage } from "./context";
import { AssistantDock } from "./dock";
import { PanelRail } from "./nav";
import { TopBar } from "./top-bar";

export function PanelShell(props: { children: ReactNode; pages?: readonly PanelPage[] }) {
  return (
    <PanelContextProvider>
      <div className="panel-shell">
        <TopBar />
        <PanelRail {...(props.pages ? { pages: props.pages } : {})} />
        <main className="panel-page" id="panel-page">{props.children}</main>
        <AssistantDock />
      </div>
    </PanelContextProvider>
  );
}
