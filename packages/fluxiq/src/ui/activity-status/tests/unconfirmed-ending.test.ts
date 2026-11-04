// A run that finished while its result check could not confirm the result carries a typed
// `unconfirmed` field, so a host draws it as neither a tick nor a cross without reading words.

import { expect, test } from "vitest";
import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { ACTIVITY_RESULT_CHECK_LABELS } from "../../activity-action/index.ts";
import { ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">): ClientGatewayActivity {
  sequence += 1;
  return { activityId: "run:r1", sequence, subject: { kind: "run", id: "r1", projectId: "p" }, at: "2026-09-29T00:00:00.000Z", ...fields };
}

function finish(label: string, status: "succeeded" | "failed"): ActivityDisplay | null {
  const shown: ActivityDisplay[] = [];
  const pacer = new ActivityPacer({ clock: new FakeClock(1_000), hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push(display) });
  pacer.accept(event({ phase: "running", label: "Run started" }));
  pacer.accept(event({ phase: "verifying", label, detail: { kind: "check", title: "Result check", status } }));
  pacer.accept(event({ phase: "done", label: "Run finished", final: true }));
  return pacer.display();
}

test("an unconfirmed or unchecked result ends the run with the typed field and its own headline", () => {
  for (const label of [ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, ACTIVITY_RESULT_CHECK_LABELS.unchecked]) {
    const display = finish(label, "failed");
    expect(display?.outcome).toBe("done");
    expect(display?.unconfirmed).toBe(true);
    expect(display?.headline).toBe("Run finished, result not confirmed");
  }
});

test("a result that answers leaves the field off", () => {
  const display = finish(ACTIVITY_RESULT_CHECK_LABELS.answers, "succeeded");
  expect(display?.unconfirmed).toBeUndefined();
  expect(display?.headline).toBe("Run finished");
});
