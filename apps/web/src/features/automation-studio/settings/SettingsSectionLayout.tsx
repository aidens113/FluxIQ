"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode, type UIEvent } from "react";

export type SettingsSectionDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function SettingsSectionLayout(props: {
  activeSection: string;
  ariaLabel: string;
  children: ReactNode;
  onActiveSectionChange(sectionId: string): void;
  sections: readonly SettingsSectionDefinition[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const frame = window.requestAnimationFrame(() => scrollToSection(contentRef.current, props.activeSection));
    return () => window.cancelAnimationFrame(frame);
  }, [props.activeSection]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => keepSelectedSectionVisible(navigationRef.current, props.activeSection));
    return () => window.cancelAnimationFrame(frame);
  }, [props.activeSection]);

  const selectSection = (sectionId: string) => {
    props.onActiveSectionChange(sectionId);
    scrollToSection(contentRef.current, sectionId);
  };
  const trackSection = (event: UIEvent<HTMLDivElement>) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    const container = event.currentTarget;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const sectionId = visibleSettingsSection(container, props.sections);
      if (sectionId && sectionId !== props.activeSection) props.onActiveSectionChange(sectionId);
    });
  };

  return (
    <div className="automation-settings-layout">
      <aside className="automation-settings-section-sidebar">
        <header><strong>Sections</strong><span>Choose an area to configure</span></header>
        <nav aria-label={props.ariaLabel} className="automation-settings-section-nav" ref={navigationRef}>
          {props.sections.map((section) => {
            const Icon = section.icon;
            const selected = props.activeSection === section.id;
            return (
              <button
                aria-controls={section.id}
                aria-current={selected ? "location" : undefined}
                className={selected ? "selected" : ""}
                key={section.id}
                onClick={() => selectSection(section.id)}
                type="button"
              >
                <Icon aria-hidden size={15} />
                <span><strong>{section.label}</strong><small>{section.description}</small></span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="automation-settings-content" onScroll={trackSection} ref={contentRef} tabIndex={0}>
        <div className="automation-flow-settings-grid">{props.children}</div>
      </div>
    </div>
  );
}

function keepSelectedSectionVisible(navigation: HTMLElement | null, sectionId: string): void {
  const selected = navigation?.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(sectionId)}"]`);
  if (!navigation || !selected) return;
  const navigationRect = navigation.getBoundingClientRect();
  const selectedRect = selected.getBoundingClientRect();
  let top = navigation.scrollTop;
  let left = navigation.scrollLeft;

  if (selectedRect.top < navigationRect.top) top += selectedRect.top - navigationRect.top;
  else if (selectedRect.bottom > navigationRect.bottom) top += selectedRect.bottom - navigationRect.bottom;
  if (selectedRect.left < navigationRect.left) left += selectedRect.left - navigationRect.left;
  else if (selectedRect.right > navigationRect.right) left += selectedRect.right - navigationRect.right;

  if (top !== navigation.scrollTop || left !== navigation.scrollLeft) {
    navigation.scrollTo({ top, left, behavior: "auto" });
  }
}

function scrollToSection(container: HTMLElement | null, sectionId: string): void {
  const target = container?.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`);
  if (!container || !target) return;
  const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTo({ top: Math.max(0, top - 16), behavior: "auto" });
}

function visibleSettingsSection(
  container: HTMLElement,
  sections: readonly SettingsSectionDefinition[]
): string | null {
  const containerRect = container.getBoundingClientRect();
  const threshold = containerRect.top + 28;
  let current = sections[0]?.id ?? null;
  for (const section of sections) {
    const element = container.querySelector<HTMLElement>(`#${CSS.escape(section.id)}`);
    if (!element) continue;
    if (element.getBoundingClientRect().top > threshold) break;
    current = section.id;
  }
  if (container.scrollHeight - container.scrollTop - container.clientHeight <= 2) {
    return sections.at(-1)?.id ?? current;
  }
  return current;
}
