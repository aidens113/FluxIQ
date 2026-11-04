// FluxIQ's step messages as data: which activity events are messages and
// what each says (`stepMessages`), each action FluxIQ took as a card
// (`actionCard`, read by Core's shared `activityActionOf`) and that card in
// words (`cardWords`), and any step, tool or check in a person's words rather
// than an id (`stepWords`), and a build with several agents: the project
// supervisor's cards and each agent's lane in words (`projectWords`,
// `laneWords`). No DOM.
export { actionCard, type ActionCard } from "./action-card.ts";
export { isAlreadyDoneStep } from "./already-done.ts";
export { cardWords, type CardWords } from "./card-words.ts";
export { doneAgainWords } from "./done-again.ts";
export { stepMessages, type StepMessage, type StepMessageKind } from "./messages.ts";
export { laneWords, projectWords, type ProjectCardWords, type ProjectNames, type ProjectWords } from "./project-words.ts";
export { stepWords, type StepWords } from "./words.ts";
export { withoutPersonCheck } from "./without-person-check.ts";
