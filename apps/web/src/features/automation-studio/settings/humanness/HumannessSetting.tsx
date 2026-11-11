"use client";

import { HUMANNESS_DEFAULT, HUMANNESS_MAX, HUMANNESS_MIN, clampHumanness, humannessAfterKey } from "./humanness-model";

/**
 * The humanness control: a 0-100 slider with its number, or "Uses the starting value" when this
 * Flow (or task) has no value of its own. `value` is null for that case; `onChange(null)` clears
 * a set value back to it. Built here for the hosted panel; W4 may move it into ui-components so
 * the extension shares it.
 */
export function HumannessSetting(props: { value: number | null; onChange(value: number | null): void; subject?: string; disabled?: boolean }) {
  const subject = props.subject ?? "Flow";
  const value = props.value;
  return (
    <div className="automation-settings-humanness">
      {value !== null ? <>
        <div className="automation-settings-inline-fields">
          <label>
            <span>Humanness</span>
            <input
              aria-label="Humanness"
              aria-valuemax={HUMANNESS_MAX}
              aria-valuemin={HUMANNESS_MIN}
              aria-valuenow={value}
              aria-valuetext={`${value} of ${HUMANNESS_MAX}`}
              disabled={props.disabled}
              max={HUMANNESS_MAX}
              min={HUMANNESS_MIN}
              step={1}
              type="range"
              value={value}
              onChange={(event) => props.onChange(clampHumanness(Number(event.target.value)))}
              onKeyDown={(event) => {
                const next = humannessAfterKey(value, event.key);
                if (next === null) return;
                event.preventDefault();
                props.onChange(next);
              }}
            />
          </label>
          <output aria-label="Humanness value" data-humanness-value>{value}</output>
        </div>
        <div className="automation-settings-inline-fields" aria-hidden>
          <span>Fastest</span>
          <span>Most human-like</span>
        </div>
        <button disabled={props.disabled} type="button" onClick={() => props.onChange(null)}>Use the starting value</button>
      </> : <>
        <p>Uses the starting value</p>
        <button disabled={props.disabled} type="button" onClick={() => props.onChange(HUMANNESS_DEFAULT)}>Set a value for this {subject}</button>
      </>}
    </div>
  );
}
