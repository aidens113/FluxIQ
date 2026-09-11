"use client";

import { AlertCircle, ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";

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
  const filtered = props.options.filter((option) => {
    const needle = query.trim().toLowerCase();
    return !needle || option.label.toLowerCase().includes(needle) || option.description?.toLowerCase().includes(needle);
  });
  const activeOption = filtered[activeIndex];

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? "");
  }, [open, selected?.label]);
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function choose(option: ComboboxOption) {
    props.onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className={`field combobox${props.error ? " field-error" : ""}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }}>
      <label className="field-label" htmlFor={inputId}>{props.label}</label>
      <div className="combobox-input-wrap">
        <input
          aria-activedescendant={open && activeOption ? `${listId}-${activeOption.value}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-expanded={open}
          aria-invalid={props.error ? true : undefined}
          autoComplete="off"
          disabled={props.disabled}
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value);
            props.onQueryChange?.(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                const count = Math.max(filtered.length, 1);
                return event.key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
              });
            } else if (event.key === "Enter" && open && activeOption) {
              event.preventDefault();
              choose(activeOption);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery(selected?.label ?? "");
            }
          }}
          placeholder={props.placeholder}
          role="combobox"
          value={query}
        />
        <ChevronDown aria-hidden size={15} />
      </div>
      {open ? (
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
              onMouseDown={(event) => event.preventDefault()}
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
