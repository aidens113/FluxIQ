"use client";

import { Fragment } from "react";
import {
  automationStudioViews,
  type AutomationStudioViewDefinition,
  type AutomationStudioViewKey
} from "../../views/canonical-view-definitions";
import type { AutomationWorkspaceViewSource } from "../../workspace/shell/contracts";
import type {
  AutomationCanonicalViewHostInput,
  AutomationCanonicalViewPublisherInputs
} from "./contracts";
import { AutomationCanonicalViewPublisher } from "./publisher";

export type { AutomationCanonicalViewPublisherInputs } from "./contracts";

const canonicalEntries = Object.entries(automationStudioViews) as Array<
  [AutomationStudioViewKey, AutomationStudioViewDefinition]
>;

export function AutomationCanonicalViewPublishers(props: {
  inputs: AutomationCanonicalViewPublisherInputs;
  source: AutomationWorkspaceViewSource;
}) {
  return (
    <Fragment>
      {canonicalEntries.map(([key, definition]) => (
        <AutomationCanonicalViewPublisher
          id={definition.id}
          input={props.inputs[key] as AutomationCanonicalViewHostInput<typeof definition.id>}
          key={definition.id}
          source={props.source}
        />
      ))}
    </Fragment>
  );
}