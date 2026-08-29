import type { StateVisualLayer } from "fluxiq/automation-studio";
import type { StateFactViewModel, StateVisualTone } from "./model/types";

export function visualToneForLayer(layer: StateVisualLayer): StateVisualTone {
  const metadata = objectMetadata(layer.metadata);
  return visualToneFromMetadata({
    tagName: stringMetadata(metadata.tagName),
    role: stringMetadata(metadata.role),
    type: stringMetadata(metadata.type),
    statePath: "statePath" in layer ? layer.statePath : undefined,
    disabled: metadata.disabled === true || metadata.disabled === "true" || metadata["aria-disabled"] === "true"
  });
}

export function visualToneFromFact(fact: StateFactViewModel): StateVisualTone {
  const metadata = objectMetadata(fact.rawValue);
  return visualToneFromMetadata({
    tagName: stringMetadata(metadata.tagName),
    role: stringMetadata(metadata.role),
    type: stringMetadata(metadata.type),
    statePath: fact.fullPath,
    disabled: metadata.disabled === true || metadata.disabled === "true" || metadata["aria-disabled"] === "true"
  });
}

export function visualToneFromMetadata(input: { tagName?: string | undefined; role?: string | undefined; type?: string | undefined; statePath?: string | undefined; disabled?: boolean | undefined }): StateVisualTone {
  if (input.disabled) return "disabled";
  const tag = input.tagName?.toLowerCase();
  const role = input.role?.toLowerCase();
  const type = input.type?.toLowerCase();
  const path = input.statePath?.toLowerCase() ?? "";
  if (tag === "a" || role === "link" || path.endsWith(".href") || path.includes(".url")) return "link";
  if (tag === "img" || tag === "picture" || tag === "video" || tag === "canvas" || role === "img" || path.includes(".image") || path.includes(".media")) return "media";
  if (tag === "nav" || role === "navigation" || role === "menubar" || role === "menu" || role === "tablist" || role === "tab" || path.includes(".nav") || path.includes(".menu") || path.includes(".tab")) return "navigation";
  if (tag === "ul" || tag === "ol" || tag === "li" || tag === "table" || tag === "tr" || tag === "td" || tag === "th" || role === "list" || role === "listitem" || role === "grid" || role === "row" || role === "cell" || role === "option" || path.includes(".list") || path.includes(".row") || path.includes(".cell") || path.includes(".option")) return "list";
  if (role === "status" || role === "alert" || role === "progressbar" || tag === "progress" || tag === "meter" || path.includes(".status") || path.includes(".alert") || path.includes(".error") || path.includes(".warning")) return "status";
  if (tag === "input" || tag === "textarea" || tag === "select" || role === "textbox" || role === "combobox" || role === "searchbox" || type === "text" || type === "search" || type === "email" || type === "password" || type === "number" || path.includes(".value") || path.includes(".input")) return "input";
  if (tag === "button" || role === "button" || role === "switch" || role === "checkbox" || role === "radio" || tag === "summary" || path.includes(".button") || path.includes(".control") || path.includes(".action")) return "control";
  if (path.includes(".text") || path.includes(".label") || path.includes(".title") || tag === "label" || tag === "span" || tag === "p" || tag === "strong" || tag === "em" || tag === "h1" || tag === "h2" || tag === "h3" || role === "heading") return "text";
  if (path.includes(".selected") || path.includes(".focus") || role === "dialog") return "selected";
  if (path.includes(".bounds") || path.includes(".visible") || tag === "section" || tag === "article" || tag === "main" || tag === "header" || tag === "footer" || tag === "aside") return "region";
  return "unknown";
}

export function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function layerStatePath(layer: StateVisualLayer): string | undefined {
  if (layer.kind !== "region" && layer.kind !== "element") return undefined;
  const statePath = typeof layer.statePath === "string" && layer.statePath.trim() ? layer.statePath.trim() : undefined;
  if (statePath) return statePath;
  const metadata = objectMetadata(layer.metadata);
  return stringMetadata(metadata.statePath) ?? stringMetadata(metadata.factPath);
}
