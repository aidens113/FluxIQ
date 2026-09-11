"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";

export type BreadcrumbItem = { label: string; href?: string; onClick?: (event: ReactMouseEvent<HTMLElement>) => void };

export function Breadcrumb(props: { items: BreadcrumbItem[]; label?: string }) {
  return (
    <nav aria-label={props.label ?? "Breadcrumb"} className="breadcrumb">
      <ol>
        {props.items.map((item, index) => {
          const current = index === props.items.length - 1;
          return <li key={`${item.label}:${index}`}>
            {index ? <ChevronRight aria-hidden size={13} /> : null}
            {current ? <span aria-current="page">{item.label}</span> : item.href ? <Link href={item.href} {...(item.onClick ? { onClick: item.onClick } : {})}>{item.label}</Link> : <button onClick={item.onClick} type="button">{item.label}</button>}
          </li>;
        })}
      </ol>
    </nav>
  );
}
