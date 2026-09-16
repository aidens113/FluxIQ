import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/programs/automation-studio"
}));

// `Modal` portals into `document.body`, and these tests run without a DOM, so the
// real one renders nothing. `AuthorizationDialog` imports it directly, so the
// module itself is stubbed rather than the `shared-ui` barrel. Everything else in
// the prompt — the dialog, its PIN field, its buttons — is the real component.
vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: ReactNode; title: string }) => createElement("section", { "aria-label": props.title }, props.children)
}));

import { RunDatasetsPanel } from "../RunDatasetsPanel";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const schema = {
  schemaVersion: "0.1" as const,
  fields: [
    { id: "sku", label: "SKU", valueType: "string" as const },
    { id: "price", label: "Unit price", valueType: "number" as const }
  ]
};

const datasets = [{ runId: "run.1", datasetId: "orders", label: "Orders", recordCount: 2 }];

function commandsWith(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(async () => ({ ok: true as const, payload: { datasets } })),
    page: vi.fn(async () => ({
      ok: true as const,
      payload: { dataset: { schema, rows: [{ sku: "A-1", price: 12 }, { sku: "A-2", price: 15 }], nextCursor: null } }
    })),
    export: vi.fn(async () => ({
      ok: true as const,
      payload: { export: { tooLarge: false, format: "csv", fileName: "orders.csv", contentType: "text/csv", body: "SKU\nA-1\n", rowCount: 2, byteCount: 10 } }
    })),
    remove: vi.fn(async () => ({ ok: true as const, payload: {} })),
    downloadHref: vi.fn(() => "/api/programs/automation-studio/run-datasets/p/run.1/orders?format=csv&domainId=web"),
    ...overrides
  } as any;
}

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.findAll((node) => node.children.some((child) => child === text)).length > 0);
}

describe("run datasets panel", () => {
  it("says so plainly when a run stored nothing", () => {
    const html = renderToStaticMarkup(createElement(RunDatasetsPanel, {
      projectId: "p",
      runId: "run.1",
      datasets: [],
      commands: commandsWith()
    }));

    expect(html).toContain("No datasets were stored by this run.");
    expect(html).not.toContain("Export CSV");
  });

  it("loads a page of rows for the selected table", async () => {
    const commands = commandsWith();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetsPanel, { projectId: "p", runId: "run.1", datasets, commands }));
    });
    await act(async () => button(renderer, "Orders")!.props.onClick());

    expect(commands.page).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p", runId: "run.1", datasetId: "orders", limit: 50 }));
    expect(renderer.root.findAllByType("th").map((cell) => cell.children[0])).toEqual(["SKU", "Unit price"]);
    await act(async () => renderer.unmount());
  });

  it("downloads an inline export and reports the row count", async () => {
    const commands = commandsWith();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetsPanel, { projectId: "p", runId: "run.1", datasets, commands }));
    });
    await act(async () => button(renderer, "Orders")!.props.onClick());
    await act(async () => button(renderer, "Export CSV")!.props.onClick());

    expect(commands.export).toHaveBeenCalledWith({ projectId: "p", runId: "run.1", datasetId: "orders", format: "csv" });
    expect(JSON.stringify(renderer.toJSON())).toContain("Exported 2 rows.");
    expect(commands.downloadHref).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("offers the streaming link, with its domain scope, when the export is too large", async () => {
    const commands = commandsWith({
      export: vi.fn(async () => ({
        ok: true as const,
        payload: { export: { tooLarge: true, format: "csv", rowCount: 40_000, downloadPath: "/ignored" } }
      }))
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetsPanel, { projectId: "p", runId: "run.1", datasets, commands }));
    });
    await act(async () => button(renderer, "Orders")!.props.onClick());
    await act(async () => button(renderer, "Export CSV")!.props.onClick());

    expect(commands.downloadHref).toHaveBeenCalledWith({ projectId: "p", runId: "run.1", datasetId: "orders", format: "csv" });
    const anchor = renderer.root.findByType("a");
    expect(anchor.props.href).toBe("/api/programs/automation-studio/run-datasets/p/run.1/orders?format=csv&domainId=web");
    expect(JSON.stringify(renderer.toJSON())).toContain("past the inline limit");
    await act(async () => renderer.unmount());
  });

  it("deletes a table only after the operator supplies a PIN", async () => {
    const commands = commandsWith();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetsPanel, { projectId: "p", runId: "run.1", datasets, commands }));
    });
    await act(async () => button(renderer, "Orders")!.props.onClick());
    await act(async () => button(renderer, "Delete")!.props.onClick());
    expect(commands.remove).not.toHaveBeenCalled();
    // `delete-run-datasets` is destructive, so the registry refuses it without a
    // PIN. Confirming alone must therefore not be able to send the request.
    expect(button(renderer, "Delete table")!.props.disabled).toBe(true);

    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "123456" } }));
    await act(async () => button(renderer, "Delete table")!.props.onClick());

    expect(commands.remove).toHaveBeenCalledWith({ projectId: "p", runId: "run.1", datasetId: "orders", authorizationPin: "123456" });
    expect(JSON.stringify(renderer.toJSON())).toContain("The table was deleted.");
    await act(async () => renderer.unmount());
  });

  it("keeps the prompt open and clears the PIN when the server refuses it", async () => {
    const commands = commandsWith({ remove: vi.fn(async () => ({ ok: false as const, error: "PIN is incorrect" })) });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetsPanel, { projectId: "p", runId: "run.1", datasets, commands }));
    });
    await act(async () => button(renderer, "Orders")!.props.onClick());
    await act(async () => button(renderer, "Delete")!.props.onClick());
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "999999" } }));
    await act(async () => button(renderer, "Delete table")!.props.onClick());

    expect(JSON.stringify(renderer.toJSON())).toContain("PIN is incorrect");
    expect(renderer.root.findByType("input").props.value).toBe("");
    expect(button(renderer, "Delete table")!.props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
});
