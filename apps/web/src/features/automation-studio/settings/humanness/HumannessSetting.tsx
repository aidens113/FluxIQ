"use client";

import "@fluxiq/ui-components/styles/chat.css";
import { createHumannessControl, type HumannessControl } from "@fluxiq/ui-components";
import { useEffect, useRef } from "react";

/**
 * The humanness control of `@fluxiq/ui-components`, hosted in a form. The control sends a level
 * through a `commit`; here that commit only hands the level to the form's draft (`onChange`: a
 * number, or null to use the starting value), and the form's own Save sends it. `value` is the
 * draft's level, null when the Flow has none of its own. `starting` is the person's starting
 * value for the wording "Uses your starting value (N)"; the host reads it from the person's
 * preferences and, with none stored, passes nothing, which reads as 0 (the last step of the precedence).
 */
export function HumannessSetting(props: { value: number | null; onChange(value: number | null): void; starting?: number | undefined }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HumannessControl | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const control = createHumannessControl({
      level: levelOf(latest.current),
      label: "Humanness",
      settleMs: 300,
      commit: async (humanness) => {
        latest.current.onChange(humanness);
        return { ok: true, value: humanness === null ? {} : { humanness } };
      }
    });
    controlRef.current = control;
    host.append(control.element);
    return () => {
      control.dispose();
      control.element.remove();
      if (controlRef.current === control) controlRef.current = null;
    };
  }, []);

  const { value, starting } = props;
  useEffect(() => {
    controlRef.current?.show(levelOf({ value, starting }));
  }, [value, starting]);

  return <div className="automation-settings-humanness" ref={hostRef} />;
}

function levelOf(props: { value: number | null; starting?: number | undefined }): { own?: number; starting: number } {
  const starting = props.starting ?? 0;
  return props.value === null ? { starting } : { own: props.value, starting };
}
