"use client";

import { useEffect, useRef, useState } from "react";
import { AuthorizationDialog, type AuthorizationCredentials } from "../../programs/shared-ui";
import { RunDatasetTable } from "./RunDatasetTable";
import { RUN_DATASET_PAGE_SIZE } from "./dataset-queries";
import type { RunDatasetCommands } from "./dataset-commands";
import type { RunDatasetExportFormat, RunDatasetPage, RunDatasetSummary } from "./types";

export type RunDatasetsPanelProps = {
  projectId?: string | null | undefined;
  runId?: string | null | undefined;
  /** The run's dataset directory, from `runDetail.datasets` (K5). */
  datasets?: RunDatasetSummary[] | null | undefined;
  commands: RunDatasetCommands;
};

type LoadedPage = { datasetId: string; schema: RunDatasetPage["schema"] | null; rows: Array<Record<string, unknown>>; nextCursor: string | null };

const NO_CREDENTIALS: AuthorizationCredentials = { password: "", pin: "", totp: "" };

/**
 * The datasets a run stored, beside Export Audit in Runtime Debug: a table per
 * dataset, a page of rows, inline CSV/JSON export, a streaming link when the
 * export is too large, and deletion.
 *
 * Deleting a table removes the rows a run captured, which the registry classifies
 * `destructive`, so `delete-run-datasets` will not run without the operator's
 * session PIN. The panel therefore collects one through the same
 * `AuthorizationDialog` the client gateway uses, rather than an inline confirm the
 * server would only refuse.
 *
 * The panel holds no transport of its own. `runtime-host.ts` binds the commands
 * and passes them in, so a test injects stubs rather than mocking the network.
 */
export function RunDatasetsPanel(props: RunDatasetsPanelProps) {
  const datasets = props.datasets ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState<LoadedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [streamHref, setStreamHref] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [credentials, setCredentials] = useState<AuthorizationCredentials>(NO_CREDENTIALS);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const requestRef = useRef(0);

  /** Closes the prompt and drops the PIN; it is never held past the request. */
  const closeDeletePrompt = () => {
    setConfirmingDelete(false);
    setCredentials(NO_CREDENTIALS);
    setDeleteError("");
    setDeleteBusy(false);
  };

  useEffect(() => {
    requestRef.current += 1;
    setSelectedId("");
    setPage(null);
    setError("");
    setMessage("");
    setStreamHref("");
    setConfirmingDelete(false);
    setCredentials(NO_CREDENTIALS);
    setDeleteError("");
    setDeleteBusy(false);
    setLoading(false);
  }, [props.projectId, props.runId]);

  const selected = datasets.find((dataset) => dataset.datasetId === selectedId) ?? null;

  const loadPage = async (datasetId: string, cursor: string | null) => {
    if (!props.projectId || !props.runId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    const result = await props.commands.page({
      projectId: props.projectId,
      runId: props.runId,
      datasetId,
      limit: RUN_DATASET_PAGE_SIZE,
      ...(cursor ? { cursor } : {})
    });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Rows could not be loaded.");
      return;
    }
    const loaded = result.payload?.dataset ?? null;
    setPage((current) => ({
      datasetId,
      schema: loaded?.schema ?? (current && current.datasetId === datasetId ? current.schema : null),
      rows: [...(cursor && current && current.datasetId === datasetId ? current.rows : []), ...(loaded?.rows ?? [])],
      nextCursor: loaded?.nextCursor ?? null
    }));
  };

  const selectDataset = (datasetId: string) => {
    setSelectedId(datasetId);
    setMessage("");
    setStreamHref("");
    closeDeletePrompt();
    setPage(null);
    void loadPage(datasetId, null);
  };

  const exportDataset = async (format: RunDatasetExportFormat) => {
    if (!props.projectId || !props.runId || !selected) return;
    setMessage("Preparing export...");
    setStreamHref("");
    const result = await props.commands.export({
      projectId: props.projectId,
      runId: props.runId,
      datasetId: selected.datasetId,
      format
    });
    if (!result.ok || !result.payload?.export) {
      setMessage(result.error ?? "Export could not be prepared.");
      return;
    }
    const answer = result.payload.export;
    if (answer.tooLarge) {
      setStreamHref(props.commands.downloadHref({
        projectId: props.projectId,
        runId: props.runId,
        datasetId: selected.datasetId,
        format
      }));
      setMessage(`${answer.rowCount} rows is past the inline limit. Use the download link.`);
      return;
    }
    downloadExportBody(answer.body, answer.contentType, answer.fileName);
    setMessage(`Exported ${answer.rowCount} rows.`);
  };

  const deleteDataset = async () => {
    if (!props.projectId || !props.runId || !selected) return;
    setDeleteBusy(true);
    setDeleteError("");
    const result = await props.commands.remove({
      projectId: props.projectId,
      runId: props.runId,
      datasetId: selected.datasetId,
      authorizationPin: credentials.pin
    });
    if (!result.ok) {
      // The prompt stays open with the PIN cleared, so a mistyped PIN costs one
      // retry rather than a dismissed dialog and a message with no way back.
      setDeleteBusy(false);
      setCredentials(NO_CREDENTIALS);
      setDeleteError(result.error ?? "The table could not be deleted.");
      return;
    }
    closeDeletePrompt();
    setSelectedId("");
    setPage(null);
    setMessage("The table was deleted. Reopen the run to refresh the list.");
  };

  return (
    <section className="automation-datasets-panel" aria-label="Run datasets">
      <header>
        <div>
          <strong>Datasets</strong>
          <span>{datasets.length ? `${datasets.length} stored` : "None stored"}</span>
        </div>
      </header>
      {datasets.length ? (
        <div className="automation-datasets-list" role="group" aria-label="Stored datasets">
          {datasets.map((dataset) => (
            <button
              aria-pressed={dataset.datasetId === selectedId}
              className={dataset.datasetId === selectedId ? "button button-primary" : "button"}
              key={dataset.datasetId}
              onClick={() => selectDataset(dataset.datasetId)}
              type="button"
            >
              {dataset.label ?? dataset.datasetId} ({dataset.recordCount} rows)
              {dataset.truncated ? " · truncated" : ""}
            </button>
          ))}
        </div>
      ) : (
        <p className="automation-datasets-empty">No datasets were stored by this run.</p>
      )}
      {error ? <div className="automation-runtime-inline-error" role="alert"><span>{error}</span></div> : null}
      {message ? <p className="automation-datasets-message">{message}</p> : null}
      {streamHref ? (
        <p className="automation-datasets-message">
          <a className="automation-runtime-row-action" href={streamHref}>Download the full export</a>
        </p>
      ) : null}
      {selected ? (
        <>
          <div className="automation-datasets-actions">
            <button className="automation-runtime-row-action" onClick={() => void exportDataset("csv")} type="button">Export CSV</button>
            <button className="automation-runtime-row-action" onClick={() => void exportDataset("json")} type="button">Export JSON</button>
            <button className="automation-runtime-row-action" onClick={() => setConfirmingDelete(true)} type="button">Delete</button>
          </div>
          <RunDatasetTable
            hasMore={Boolean(page?.nextCursor)}
            label={`Rows of ${selected.label ?? selected.datasetId}`}
            loading={loading}
            onLoadMore={() => void loadPage(selected.datasetId, page?.nextCursor ?? null)}
            rows={page && page.datasetId === selected.datasetId ? page.rows : []}
            schema={page && page.datasetId === selected.datasetId ? page.schema : null}
          />
          {confirmingDelete ? (
            <AuthorizationDialog
              actionLabel="Delete table"
              busy={deleteBusy}
              credentials={credentials}
              description={`Deleting "${selected.label ?? selected.datasetId}" removes the ${selected.recordCount} rows this run captured. It cannot be undone.`}
              error={deleteError}
              requirements={{ pin: true }}
              title="Delete this table"
              onAuthorize={() => void deleteDataset()}
              onCancel={() => { if (!deleteBusy) closeDeletePrompt(); }}
              onChange={setCredentials}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function downloadExportBody(body: string, contentType: string, fileName: string): void {
  if (typeof window === "undefined" || typeof URL === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([body], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
