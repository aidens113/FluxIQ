"use client";

import { useEffect, useMemo } from "react";
import type { AutomationStudioViewId } from "../../views/view-registry";
import type { AutomationWorkspaceViewSource } from "../../workspace/shell/contracts";
import { createAutomationCanonicalViewEntry } from "./composition";
import type { AutomationCanonicalViewHostInput } from "./contracts";

export function AutomationCanonicalViewPublisher<Id extends AutomationStudioViewId>(props: {
  id: Id;
  input: AutomationCanonicalViewHostInput<Id>;
  source: AutomationWorkspaceViewSource;
}) {
  const entry = useMemo(
    () => createAutomationCanonicalViewEntry(props.id, props.input),
    [props.id, props.input]
  );

  useEffect(() => {
    props.source.replace(props.id, entry);
    return () => {
      if (props.source.get(props.id) === entry) props.source.replace(props.id, null);
    };
  }, [entry, props.id, props.source]);

  return null;
}