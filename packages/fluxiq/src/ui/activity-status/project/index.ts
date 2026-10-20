// What a build with several agents says about itself on the wire: which agent
// an event comes from (`activityAgent`) and the card of the supervisor's work
// a note row carries (`projectCard`), each read in the contract's shape only.
// Pure: no browser API.
export { activityAgent, type ActivityAgent } from "./agent.ts";
export { projectCard, type ActivityProjectCard } from "./project-card.ts";
