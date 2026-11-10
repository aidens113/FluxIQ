"use client";

// A panel page that is not built yet: its name, one plain sentence of what will
// be here, and the page published to the panel so the assistant knows where the
// person is.

import { PublishPanelPage, type PanelPage } from "../context";

export function PanelPlaceholderPage(props: { page: PanelPage; title: string; summary: string }) {
  return (
    <>
      <PublishPanelPage page={props.page} />
      <h1>{props.title}</h1>
      <p>{props.summary}</p>
    </>
  );
}
