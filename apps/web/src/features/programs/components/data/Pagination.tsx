"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { IconButton } from "../controls";

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  onPageSizeChange?(pageSize: number): void;
  pageSizes?: number[];
  loading?: boolean;
  label?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize)));
  const page = Math.max(1, Math.min(pageCount, props.page));
  const start = props.total ? (page - 1) * props.pageSize + 1 : 0;
  const end = Math.min(props.total, page * props.pageSize);
  const sizes = props.pageSizes ?? [25, 50, 100];
  return (
    <nav aria-busy={props.loading || undefined} aria-label={props.label ?? "Pagination"} className="pagination">
      <span className="pagination-range">{start}-{end} of {props.total}</span>
      {props.onPageSizeChange ? <label className="pagination-size"><span>Rows</span><select aria-label="Rows per page" disabled={props.loading} onChange={(event) => props.onPageSizeChange?.(Number(event.target.value))} value={props.pageSize}>{sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label> : null}
      <div className="pagination-actions">
        <IconButton disabled={props.loading || page <= 1} label="First page" onClick={() => props.onPageChange(1)}><ChevronsLeft aria-hidden size={15} /></IconButton>
        <IconButton disabled={props.loading || page <= 1} label="Previous page" onClick={() => props.onPageChange(page - 1)}><ChevronLeft aria-hidden size={15} /></IconButton>
        <span aria-live="polite">Page {page} of {pageCount}</span>
        <IconButton disabled={props.loading || page >= pageCount} label="Next page" onClick={() => props.onPageChange(page + 1)}><ChevronRight aria-hidden size={15} /></IconButton>
        <IconButton disabled={props.loading || page >= pageCount} label="Last page" onClick={() => props.onPageChange(pageCount)}><ChevronsRight aria-hidden size={15} /></IconButton>
      </div>
    </nav>
  );
}
