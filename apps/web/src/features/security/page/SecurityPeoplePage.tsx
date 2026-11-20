"use client";

import { PeopleSection } from "../access";
import { SecurityTabPage } from "./SecurityTabPage";

/** `/security/people`: who can use this FluxIQ, with their roles, and inviting more people. `twoStep` is whether the viewer has two-step sign-in on. */
export function SecurityPeoplePage(props: { twoStep: boolean }) {
  return (
    <SecurityTabPage active="people">
      <PeopleSection twoStep={props.twoStep} />
    </SecurityTabPage>
  );
}
