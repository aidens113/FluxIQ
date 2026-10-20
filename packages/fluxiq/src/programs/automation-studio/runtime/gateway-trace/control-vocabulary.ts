// The control stream of an episode's trace (D1): inputs that reach Core
// outside the client gateway's socket, and the markers a parent episode keeps
// when a child episode (a trial inside a build) opens and closes. Each is
// recorded on `stream` with message type `control.<type>`.
export const AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL = Object.freeze({
  stream: "control",
  types: Object.freeze([
    "append_turn",
    "ask_answer",
    "run_control",
    "start_hook_answer",
    "artifact_intake",
    "child_episode_opened",
    "child_episode_closed"
  ] as const)
});
