"use client";

import { useCallback } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { useResource } from "../../home/data";
import { PublishPanelPage } from "../../panel-shell";
import { loadDatasetRows } from "../data";
import { DataView } from "./DataView";

/** Every table of collected rows from every project, newest first, filterable by Flow and text. */
export function DataPage() {
  const studio = useProgramTransport("automation-studio");
  const tables = useResource(useCallback((signal: AbortSignal) => loadDatasetRows(studio, signal), [studio]));
  return (
    <>
      <PublishPanelPage page="data" />
      <DataView tables={tables} now={Date.now()} />
    </>
  );
}
