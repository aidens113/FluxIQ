/**
 * Which of a build's agents an event comes from (automation-project-agents-plan,
 * chat presentation). Optional and additive: absent on a build with one agent,
 * and a client that does not know it reads the event as before. `briefId` is
 * never a digest; Core bounds `subflowName` to 160 characters.
 */
export type ClientGatewayActivityAgent = {
  role: "supervisor" | "builder" | "repair" | "validator";
  briefId?: string;
  subflowName?: string;
};
