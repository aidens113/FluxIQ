"use client";

import { AlertCircle, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string; description?: string };

export function Combobox(props: {
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  loading?: boolean;
  onQueryChange?(query: string): void;
}) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = `combobox-${generatedId}`;
  const listId = `${inputId}-list`;
  const hintId = props.hint ? `${inputId}-hint` : undefined;
  const errorId = props.error ? `${inputId}-error` : undefined;
  const selected = props.options.find((option) => option.value === props.value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [activeIndex, setActiveIndex] = useState(0);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owner = useRef({ options: props.options, value: props.value, disabled: Boolean(props.disabled), onChange: props.onChange, onQueryChange: props.onQueryChange });
  if (owner.current.options !== props.options || owner.current.value !== props.value || owner.current.disabled !== Boolean(props.disabled) || owner.current.onChange !== props.onChange || owner.current.onQueryChange !== props.onQueryChange) {
    owner.current = { options: props.options, value: props.value, disabled: Boolean(props.disabled), onChange: props.onChange, onQueryChange: props.onQueryChange };
  }
  const lease = owner.current;
  const current = () => mounted.current && owner.current === lease && !lease.disabled;
  const expanded = open && !props.disabled;
  const filtered = props.options.filter((option) => {
    const needle = query.trim().toLowerCase();
    return !needle || option.label.toLowerCase().includes(needle) || option.description?.toLowerCase().includes(needle);
  });
  const activeOption = filtered[activeIndex];
  const view = useRef({ expanded, filtered, activeOption, selected });
  view.current = { expanded, filtered, activeOption, selected };

  useEffect(() => {
    if (!expanded) setQuery(selected?.label ?? "");
  }, [expanded, selected?.label]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function choose(option: ComboboxOption) {
    if (!current() || !view.current.expanded || !lease.options.includes(option) || !view.current.filtered.includes(option)) return;
    view.current.expanded = false;
    setQuery(option.label);
    setOpen(false);
    lease.onChange(option.value);
  }

  return (
    <div className={`field combobox${props.error ? " field-error" : ""}`} onBlur={(event) => {
      if (!current()) return;
      if (!event.currentTarget.contains(event.relatedTarget)) {
        view.current.expanded = false;
        setOpen(false);
        setQuery(view.current.selected?.label ?? "");
      }
    }}>
      <label className="field-label" htmlFor={inputId}>{props.label}</label>
      <div className="combobox-input-wrap">
        <input
          aria-activedescendant={expanded && activeOption ? `${listId}-${activeOption.value}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-expanded={expanded}
          aria-invalid={props.error ? true : undefined}
          autoComplete="off"
          disabled={props.disabled}
          id={inputId}
          onChange={(event) => {
            if (!current()) return;
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
            lease.onQueryChange?.(event.target.value);
          }}
          onClick={() => { if (current()) setOpen(true); }}
          onKeyDown={(event) => {
            if (!current() || event.defaultPrevented || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                const count = Math.max(view.current.filtered.length, 1);
                if (!view.current.expanded) return event.key === "ArrowDown" ? 0 : count - 1;
                return event.key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
              });
            } else if (event.key === "Enter" && view.current.expanded && view.current.activeOption) {
              event.preventDefault();
              choose(view.current.activeOption);
            } else if (event.key === "Escape") {
              view.current.expanded = false;
              setOpen(false);
              setQuery(view.current.selected?.label ?? "");
            }
          }}
          placeholder={props.placeholder}
          role="combobox"
          value={query}
        />
        <ChevronDown aria-hidden size={15} />
      </div>
      {expanded ? (
        <div className="combobox-listbox" id={listId} role="listbox">
          {filtered.length ? filtered.map((option) => (
            <div
              aria-selected={option.value === props.value}
              className={[
                option.value === props.value ? "selected" : "",
                option.value === activeOption?.value ? "active" : ""
              ].filter(Boolean).join(" ")}
              id={`${listId}-${option.value}`}
              key={option.value}
              onMouseDown={(event) => { if (current()) event.preventDefault(); }}
              onClick={() => choose(option)}
              role="option"
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </div>
          )) : <div className="combobox-empty">{props.loading ? "Loading options..." : "No matching options."}</div>}
        </div>
      ) : null}
      {props.hint ? <small className="field-message" id={hintId}>{props.hint}</small> : null}
      {props.error ? <small className="field-message error" id={errorId} role="alert"><AlertCircle aria-hidden size={13} />{props.error}</small> : null}
    </div>
  );
}
