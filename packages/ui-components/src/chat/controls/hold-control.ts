import type { ClientGatewayActivity } from "fluxiq/ui";
import { createElement } from "../../dom/index.ts";
import type { ChatRunPort } from "../ports/index.ts";

type Press = "take" | "hand";

const WORDS: Record<Press, { label: string; busy: string; failed: string }> = {
  take: { label: "Take over", busy: "Taking over…", failed: "Couldn't take over. Try again." },
  hand: { label: "Hand back", busy: "Handing back…", failed: "Couldn't hand back. Try again." }
};

/**
 * Take over and Hand back, beside Stop, for a run (never a build).
 *
 * While a run works, "Take over" asks Core to hold it at the next step so the
 * person can use the page (`runs.takeOver`, Core's `pause-runtime-session`
 * with `takeControl`). While Core says the run is held (phase `paused`), the
 * control says whose page it is and from which step FluxIQ continues, with
 * "Hand back" (`runs.handBack`). The Lab presses both by these names. Where the
 * client has no `runs.openInstructions`, the recovery button never shows.
 *
 * Like Stop (`stop-control.ts`) it follows the raw live subject, with an owner
 * lease checked again when a reply comes back: a reply for an older run, or
 * for a chat that changed owner, changes nothing. A press stays disabled from
 * the click until Core's activity says the run moved (held, or working again),
 * so one press is never sent twice; a failed press says so and can be retried.
 */
export function createHoldControl(runs: ChatRunPort, eligible: () => boolean) {
  let current: ClientGatewayActivity | null = null;
  // The press waiting for Core's activity to move, and the run it was for.
  let pending: { activityId: string; press: Press } | null = null;
  let notice = "";
  let generation = 0;
  const sentence = createElement("p", { className: "chat-hold-sentence" });
  const button = createElement("button", { className: "chat-hold", attrs: { type: "button" } });
  const status = createElement("span", { className: "chat-hold-status", attrs: { role: "status", "aria-live": "polite" } });
  const recovery = createElement("button", { text: "Open task Instructions in FluxIQ", hidden: true, attrs: { type: "button" } });
  const element = createElement("div", { className: "chat-hold-control", hidden: true }, [sentence, button, status, recovery]);

  const live = () => current !== null && current.subject.kind === "run" && !current.final
    && current.phase !== "done" && current.phase !== "failed";
  const held = () => live() && current!.phase === "paused";
  /** What a press does now; null when the control offers nothing. */
  const press = (): Press | null => !live() ? null : held() ? "hand" : current!.phase === "waiting_permission" ? null : "take";

  function render() {
    const now = press();
    element.hidden = now === null || !eligible();
    if (element.hidden) return;
    const busy = pending !== null && pending.activityId === current?.activityId;
    const words = WORDS[busy ? pending!.press : now!];
    button.disabled = busy;
    button.textContent = busy ? words.busy : words.label;
    sentence.hidden = now !== "hand";
    sentence.textContent = now === "hand" ? heldSentence(current!) : "";
    status.textContent = notice;
    recovery.hidden = runs.openInstructions === undefined || !notice.startsWith("Author task instructions");
  }

  function send(target: ClientGatewayActivity, kind: Press) {
    const lease = generation;
    pending = { activityId: target.activityId, press: kind };
    notice = "";
    render();
    const failed = () => {
      if (generation !== lease || current?.activityId !== target.activityId || !eligible()) {
        return;
      }
      pending = null;
      notice = WORDS[kind].failed;
      render();
    };
    const run = { projectId: target.subject.projectId, runId: target.subject.id };
    void (kind === "take" ? runs.takeOver(run) : runs.handBack(run)).then((reply) => {
      if (!reply.ok) {
        failed();
        if ((reply.code === "automation.instructions_required" || reply.code === "automation.instruction_led_authoring_required") && generation === lease && current?.activityId === target.activityId) {
          notice = reply.sentence;
          render();
        }
      }
    }).catch(/* best-effort: a failed relay leaves the press retryable */ failed);
  }

  recovery.addEventListener("click", () => {
    const target = current;
    if (!target || target.subject.kind !== "run") {
      return;
    }
    const opened = runs.openInstructions?.(target.subject.id);
    void opened?.then((result) => {
      if (!result.ok && current?.activityId === target.activityId) {
        notice = result.sentence;
        render();
      }
    });
  });

  button.addEventListener("click", () => {
    const now = press();
    if (!eligible() || now === null || current === null) {
      return;
    }
    if (pending !== null && pending.activityId === current.activityId) {
      return;
    }
    send(current, now);
  });

  return {
    element,
    /** Shows `activity`'s Take over or Hand back; null, a build, or ended work hides it. */
    update(activity: ClientGatewayActivity | null) {
      if (current?.activityId !== activity?.activityId) {
        generation++;
        pending = null;
        notice = "";
      }
      current = activity;
      // Core's activity moved the way the press asked: the press is done.
      if (pending !== null && current !== null && pending.activityId === current.activityId
        && (pending.press === "take" ? current.phase === "paused" : current.phase !== "paused")) pending = null;
      render();
    }
  };
}

/** "You have the page. FluxIQ continues from step N when you hand back." */
function heldSentence(activity: ClientGatewayActivity): string {
  const step = activity.step?.index;
  const from = typeof step === "number" && Number.isFinite(step) ? ` from step ${step}` : "";
  return `You have the page. FluxIQ continues${from} when you hand back.`;
}
