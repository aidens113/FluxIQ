"use client";

import { useEffect, useState } from "react";
import { applyTheme } from "./apply-theme";
import { readTheme } from "./read-theme";
import { type ThemeChoice, themeChoices } from "./theme";

/** Dark, Light or System, kept in this browser and applied to the whole panel at once. */
export function AppearanceSection() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  useEffect(() => setChoice(readTheme()), []);
  return (
    <section aria-labelledby="settings-appearance">
      <h2 id="settings-appearance">Appearance</h2>
      <p>Dark is the default. System follows your device. The choice stays in this browser.</p>
      <fieldset className="settings-appearance" aria-labelledby="settings-appearance">
        {themeChoices.map((option) => (
          <label key={option.value} className="settings-appearance-choice">
            <input
              type="radio"
              name="settings-theme"
              value={option.value}
              checked={choice === option.value}
              onChange={() => {
                setChoice(option.value);
                applyTheme(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
