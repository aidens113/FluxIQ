import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/programs/automation-studio"
}));

import { RunDatasetTable } from "../RunDatasetTable";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const schema = {
  schemaVersion: "0.1" as const,
  fields: [
    { id: "sku", label: "SKU", valueType: "string" as const },
    { id: "price", label: "Unit price", valueType: "number" as const },
    { id: "link", label: "Product link", valueType: "url" as const },
    { id: "raw", label: "Raw", valueType: "json" as const }
  ]
};

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.findAll((node) => node.children.some((child) => child === text)).length > 0);
}

describe("run dataset table", () => {
  it("takes its columns from the stored schema, in schema order, never from row keys", () => {
    const html = renderToStaticMarkup(createElement(RunDatasetTable, {
      label: "Rows of Orders",
      schema,
      rows: [{ price: 12, sku: "A-1", surprise: "not-a-column" }]
    }));

    const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/gu)].map((match) => match[1]);
    expect(headers).toEqual(["SKU", "Unit price", "Product link", "Raw"]);
    expect(html).toContain("A-1");
    expect(html).toContain("12");
    expect(html).not.toContain("surprise");
    expect(html).not.toContain("not-a-column");
  });

  it("renders a URL as text and never as a link", () => {
    const html = renderToStaticMarkup(createElement(RunDatasetTable, {
      label: "Rows of Orders",
      schema,
      rows: [{ sku: "A-1", link: "https://example.test/product/1" }]
    }));

    expect(html).toContain("https://example.test/product/1");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });

  it("keeps a missing value as a placeholder rather than shifting the row", () => {
    const html = renderToStaticMarkup(createElement(RunDatasetTable, {
      label: "Rows of Orders",
      schema,
      rows: [{ sku: "A-1" }]
    }));

    expect((html.match(/<td[^>]*>/gu) ?? []).length).toBe(4);
  });

  it("pages with Load more only while a cursor remains", async () => {
    const onLoadMore = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(RunDatasetTable, {
        label: "Rows of Orders",
        schema,
        rows: [{ sku: "A-1" }],
        hasMore: true,
        onLoadMore
      }));
    });
    await act(async () => button(renderer, "Load more")!.props.onClick());
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(createElement(RunDatasetTable, {
        label: "Rows of Orders",
        schema,
        rows: [{ sku: "A-1" }],
        hasMore: false,
        onLoadMore
      }));
    });
    expect(button(renderer, "Load more")).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});
