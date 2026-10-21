// The person-facing sweep for the shared status reader (t753): a project build
// that ends the way round 5's did, read through the pacer the overlay and the
// chat's live line both show, its headline and line put through the guard
// (`../person-facing/`). Round 5's overlay read "Build failed | Build failed:
// FluxIQ could not finish the Flow: I could not finish this." Events are built
// as Core sends them, with no site, product or task in them.
import { expect, it } from "vitest";
import { ActivityPacer, type ClientGatewayActivity } from "../activity-status/index.ts";
import { FakeClock } from "../activity-status/tests/fake-clock.ts";
import { TEST_HOST_WORDS } from "../activity-status/tests/test-host-words.ts";
import { personFacingTextFaults } from "../person-facing/index.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">): ClientGatewayActivity {
  sequence += 1;
  return { activityId: "build:b1", sequence, subject: { kind: "build", id: "b1", projectId: "p" }, at: "2026-10-20T10:00:00.000Z", ...fields };
}

const REASON = "I could not finish this.";
const ENDED = "Build failed: FluxIQ could not finish the Flow";

it("activity-status pacer: a project build its supervisor could not finish", () => {
  const pacer = new ActivityPacer({ clock: new FakeClock(1_000), hostWords: TEST_HOST_WORDS, onChange: () => undefined });
  pacer.accept(event({ phase: "building", label: "Building the Flow", detail: { kind: "step", title: "Build started", status: "started" } }));
  pacer.accept(event({ phase: "verifying", label: "Checking whether the Flow is finished", agent: { role: "supervisor" }, detail: { kind: "thought", title: "Checking whether the Flow is finished", text: REASON, status: "succeeded" } }));
  pacer.accept(event({ phase: "building", label: "FluxIQ could not finish the Flow.", detail: { kind: "note", title: "FluxIQ could not finish the Flow.", text: REASON, status: "failed" } }));
  pacer.accept(event({ phase: "failed", label: ENDED, detail: { kind: "step", title: ENDED, status: "failed", text: REASON }, final: true }));
  const display = pacer.display();
  expect(display?.outcome).toBe("failed");
  const shown = `${display?.headline ?? ""}${display?.detail ? ` | ${display.detail}` : ""}`;
  expect({ shown, faults: personFacingTextFaults(shown) }).toEqual({ shown, faults: [] });
});
