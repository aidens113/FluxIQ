import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Save } from "lucide-react";
import { ActionLink, Breadcrumb, Button, CodeViewer, Combobox, DataTable, EmptyState, Field, IconButton, JsonViewer, List, ListRow, LoadingState, Menu, ModalContent, Pagination, Progress, Segmented, Skeleton, Splitter, StatusBadge, Toolbar, Tooltip, Tree, titleFromTone, toneFromMessage, VisualAlert } from "./shared-ui";

describe("critical shared UI states", () => {
  it("renders privileged confirmations as an accessible modal", () => {
    const html = renderToStaticMarkup(
      <ModalContent busy className="wide-dialog" description="Re-enter credentials to continue." title="Confirm privileged action" onClose={() => undefined}>
        <label>
          Password
          <input name="password" type="password" />
        </label>
        <button className="button button-primary" type="button">
          Confirm
        </button>
      </ModalContent>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="dialog-title-');
    expect(html).toContain('aria-describedby="dialog-title-');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Re-enter credentials to continue.");
    expect(html).toContain('class="modal-panel wide-dialog"');
    expect(html).toContain("Confirm privileged action");
    expect(html).toContain('type="password"');
  });

  it("exposes segmented choices as a labelled pressed-state group", () => {
    const html = renderToStaticMarkup(<Segmented label="Run mode" onChange={() => undefined} options={["Adaptive", "Manual"]} value="Adaptive" />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Run mode"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders an accessible keyboard menu with explicit action semantics", () => {
    const html = renderToStaticMarkup(<Menu defaultOpen label="Flow actions" options={[
      { id: "rename", label: "Rename", onSelect: () => undefined },
      { id: "account", label: "Account", href: "/programs/identity-access" },
      { id: "delete", label: "Delete", danger: true, onSelect: () => undefined },
    ]} />);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('href="/programs/identity-access"');
    expect(html).toContain('class="danger"');
  });

  it("renders searchable object choices as a labelled combobox and listbox", () => {
    const html = renderToStaticMarkup(<Combobox defaultOpen label="Subflow" onChange={() => undefined} options={[
      { value: "checkout", label: "Checkout", description: "Complete purchase" },
      { value: "support", label: "Support" },
    ]} value="checkout" />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
  });

  it("keeps tooltip text supplemental to the control accessible name", () => {
    const html = renderToStaticMarkup(<Tooltip content="Save current changes"><IconButton label="Save"><Save aria-hidden size={14} /></IconButton></Tooltip>);
    expect(html).toContain('data-tooltip="Save current changes"');
    expect(html).toContain('aria-label="Save"');
  });
  it("connects field labels, hints, validation, and required state", () => {
    const html = renderToStaticMarkup(<Field error="Name is required" hint="Shown in the project tree" id="flow-name" label="Flow name" required><input /></Field>);
    expect(html).toContain('for="flow-name"');
    expect(html).toContain('id="flow-name"');
    expect(html).toContain('aria-describedby="flow-name-hint flow-name-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('role="alert"');
  });
  it("renders command, icon, busy, and link primitives with stable semantics", () => {
    const html = renderToStaticMarkup(<div>
      <Button variant="primary">Save</Button>
      <Button busy variant="danger">Delete</Button>
      <IconButton label="Save Flow"><Save size={14} aria-hidden /></IconButton>
      <ActionLink href="/programs">Programs</ActionLink>
    </div>);
    expect(html).toContain("button button-primary");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Save Flow"');
    expect(html).toContain('title="Save Flow"');
    expect(html).toContain('class="action-link"');
  });
  it("renders labelled tables and bottom pagination with complete range controls", () => {
    const html = renderToStaticMarkup(<div>
      <DataTable columns={["Name", "Status"]} label="Flow runs" rowKeys={["run-1"]} rows={[["Checkout", <StatusBadge key="status" value="completed" />]]} />
      <Pagination onPageChange={() => undefined} onPageSizeChange={() => undefined} page={2} pageSize={25} total={80} />
    </div>);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain("26-50 of 80");
    expect(html).toContain("Page 2 of 4");
    expect(html).toContain('aria-label="First page"');
    expect(html).toContain('aria-label="Last page"');
    expect(html).toContain('aria-label="Rows per page"');
  });

  it("renders single-action list rows without nesting secondary actions", () => {
    const html = renderToStaticMarkup(<List label="Previous runs"><ListRow actions={<IconButton label="Delete"><Save aria-hidden size={12} /></IconButton>} description="Completed" onOpen={() => undefined} selected title="Checkout run" /></List>);
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("list-row-actions");
  });

  it("renders hierarchical groups with roving tree focus and expansion state", () => {
    const html = renderToStaticMarkup(<Tree expandedIds={new Set(["flow"])} label="Flows" nodes={[
      { id: "flow", label: "Checkout", children: [{ id: "settings", label: "Settings" }] },
    ]} onSelect={() => undefined} onToggle={() => undefined} selectedId="settings" />);
    expect(html).toContain('role="tree"');
    expect(html).toContain('role="treeitem"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Collapse Checkout"');
  });
  it("renders labelled toolbars, breadcrumbs, and keyboard splitters", () => {
    const html = renderToStaticMarkup(<div>
      <Toolbar label="Flow commands"><Button>Save</Button></Toolbar>
      <Breadcrumb items={[{ label: "Projects", href: "/programs" }, { label: "Checkout" }]} />
      <Splitter label="Resize hierarchy" max={40} min={15} onChange={() => undefined} onReset={() => undefined} orientation="vertical" value={24} />
    </div>);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Flow commands"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-valuenow="24"');
    expect(html).toContain('aria-orientation="vertical"');
  });

  it("keeps JSON collapsed by default and bounds disclosed previews", () => {
    const largeValue = Object.fromEntries(Array.from({ length: 700 }, (_, index) => [`item-${index}`, { value: index }]));
    const collapsed = renderToStaticMarkup(<JsonViewer label="Raw JSON" value={{ secret: "not-eagerly-rendered" }} />);
    const open = renderToStaticMarkup(<JsonViewer defaultOpen label="Raw JSON" value={largeValue} />);
    expect(collapsed).not.toContain("not-eagerly-rendered");
    expect(collapsed).toContain("View details");
    expect(open).toContain("Preview truncated");
    expect(open).toContain("bounded for browser performance");
  });

  it("renders code tools with search, wrapping, copy, and optional download", () => {
    const html = renderToStaticMarkup(<CodeViewer code={'const ready = true;'} filename="flow.ts" label="Flow source" language="typescript" />);
    expect(html).toContain('aria-label="Flow source tools"');
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Toggle line wrapping"');
    expect(html).toContain('aria-label="Copy source"');
    expect(html).toContain('aria-label="Download source"');
    expect(html).toContain('data-language="typescript"');
  });
  it("renders normalized status labels with semantic tone classes and icons", () => {
    const html = renderToStaticMarkup(<StatusBadge value="manual_approval" />);
    expect(html).toContain("tone-warning");
    expect(html).toContain("Manual approval");
    expect(html).not.toMatch(/class="[^"]*manual_approval/);
    expect(html).toContain("lucide-triangle-alert");
  });
  it("keeps persistent notices inline with semantic tone and announcement", () => {
    const html = renderToStaticMarkup(<VisualAlert tone="error" title="Access denied" message="Fresh credentials are required." />);
    expect(html).toContain('class="inline-notice error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Fresh credentials are required.");
    expect(toneFromMessage("Fresh credentials are required.")).toBe("error");
    expect(titleFromTone("error")).toBe("Action failed");
  });

  it("renders explicit loading, skeleton, progress, and empty feedback states", () => {
    const html = renderToStaticMarkup(<div>
      <LoadingState detail="Fetching actions" label="Loading run" />
      <Skeleton label="Loading rows" lines={2} />
      <Progress detail="Action 4 of 10" label="Run progress" value={40} />
      <EmptyState description="Create the first instruction to make this Flow runnable." title="No instructions" />
    </div>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading rows"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("No instructions");
  });
});
