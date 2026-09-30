"use client";

// Pause, take control, and resume for the run in progress.
//
// A run is held only between two steps, so Pause first reads "Pausing..." and
// the run goes on holding once the step in flight has finished. While a person
// has the page, FluxIQ touches nothing; Continue hands it back and records that
// they acted, and the run goes on from the step it was about to take.

import React from "react";
import type { RunControlHandle } from "./useRunControl";

export function RunControlBar(props: { control: RunControlHandle }) {
  const { control } = props;
  if (!control.available) return null;
  const state = control.answer?.live ? control.answer.runControl?.state ?? null : null;
  const holder = control.answer?.runControl?.holder ?? null;
  const progress = control.answer?.progress ?? null;
  const personHasPage = state === "paused" && holder === "person";
  return (
    <div aria-label="Run controls" className="automation-runtime-live-control" data-run-control-state={state ?? "unknown"} role="group">
      <div>
        <strong>{progress?.label ?? "Running"}</strong>
        <span>{progress?.detail ?? (state === "running" ? "Pause between steps at any time, or take control of the page." : "")}</span>
        {control.error ? <span role="alert">{control.error}</span> : null}
      </div>
      {state === "running" ? <>
        <button className="button" disabled={!control.canPause} onClick={() => void control.pause(false)} type="button">Pause</button>
        <button className="button" disabled={!control.canPause} onClick={() => void control.pause(true)} type="button">Take control</button>
      </> : null}
      {state === "pause_requested" ? <>
        <button className="button" disabled={control.busy} onClick={() => void control.resume(false)} type="button">Keep running</button>
        {holder !== "person" ? <button className="button" disabled={control.busy} onClick={() => void control.pause(true)} type="button">Take control</button> : null}
      </> : null}
      {state === "paused" && !personHasPage ? <>
        <button className="button button-primary" disabled={control.busy} onClick={() => void control.resume(false)} type="button">Resume</button>
        <button className="button" disabled={control.busy} onClick={() => void control.pause(true)} type="button">Take control</button>
      </> : null}
      {personHasPage ? <>
        <button className="button button-primary" disabled={control.busy} onClick={() => void control.resume(true)} type="button">Continue</button>
        <button className="button" disabled={control.busy} onClick={() => void control.resume(false)} type="button">Return control to FluxIQ</button>
      </> : null}
    </div>
  );
}
