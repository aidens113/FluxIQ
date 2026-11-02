// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { ExecutionObservationSource, ExecutionCallbackRootSource } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioCommandExecutionController } from "../../command-execution/index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioExecutionAdmissionController } from "../index.ts";

it("records the actual tool before its callback and preserves receiver, arguments and result", async () => {
  await sqlAdmissionFixture(async ({ pool }) => {
    const lease = await pool.acquire("project.isolated");
    const required = new AutomationStudioCommandExecutionController({ pool, getRuntimeSession: async () => null });
    const controller = new AutomationStudioExecutionAdmissionController({ pool, requiredOwner: required, getRuntimeSession: async () => null });
    try {
      await lease.database.run("insert into flows(flow_id,name,scope_kind,visibility,origin,source_mode,status,created_at_ms,updated_at_ms) values('flow.actual','Actual','project','project','user','visual','draft',1,1)");
      const continuation = await controller.open({ projectId: "project.isolated", flowId: "flow.actual" });
      const callbacks = new ExecutionObservationSource(continuation.scope, "actual.build.callbacks");
      const tools = new ExecutionCallbackRootSource(continuation.scope, continuation.assembly.consumer, callbacks, "studio.build.tools");
      tools.connect(continuation.assembly.registerSource(tools.registration([callbacks.owner])));
      callbacks.connect(continuation.assembly.registerSource(callbacks.registration([callbacks.owner])));
      const result = {}, argument = {}, receiver = { calls: 0 };
      async function original(this: typeof receiver, actual: object) {
        expect(this).toBe(receiver);
        expect(actual).toBe(argument);
        expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("pending");
        this.calls += 1;
        return result;
      }
      callbacks.manage({ receiver, callback: original, contract: "no_direct_effects" });
      await expect(tools.invoke({ receiver, callback: original, args: [argument] })).resolves.toBe(result);
      expect(receiver.calls).toBe(1);
      // A managed callback cannot invent the host resource baseline the real owner lacks.
      expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("unverified");
      const opaqueResult = {};
      const opaque = async () => opaqueResult;
      await expect(tools.invoke({ receiver: undefined, callback: opaque, args: [] })).resolves.toBe(opaqueResult);
      expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("unverified");
    } finally {
      await controller.close();
      await required.close();
      await lease.release();
    }
  });
});

it("an opaque write then throw remains pending after reopen and prevents another callback", async () => {
  await sqlAdmissionFixture(async ({ pool }) => {
    const lease = await pool.acquire("project.isolated");
    const required = new AutomationStudioCommandExecutionController({ pool, getRuntimeSession: async () => null });
    const controller = new AutomationStudioExecutionAdmissionController({ pool, requiredOwner: required, getRuntimeSession: async () => null });
    try {
      await lease.database.run("insert into flows(flow_id,name,scope_kind,visibility,origin,source_mode,status,created_at_ms,updated_at_ms) values('flow.actual','Actual','project','project','user','visual','draft',1,1)");
      await lease.database.run("create table actual_tool_counter (value integer not null)");
      await lease.database.run("insert into actual_tool_counter values(0)");
      const failure = new Error("actual callback lost its result");
      const call = async () => {
        await lease.database.run("update actual_tool_counter set value=value+1");
        throw failure;
      };
      const open = async () => {
        const continuation = await controller.open({ projectId: "project.isolated", flowId: "flow.actual" });
        const callbacks = new ExecutionObservationSource(continuation.scope, "actual.build.callbacks");
        const tools = new ExecutionCallbackRootSource(continuation.scope, continuation.assembly.consumer, callbacks, "studio.build.tools");
        tools.connect(continuation.assembly.registerSource(tools.registration([callbacks.owner])));
        callbacks.connect(continuation.assembly.registerSource(callbacks.registration([callbacks.owner])));
        return { continuation, tools };
      };
      const first = await open();
      await expect(first.tools.invoke({ receiver: undefined, callback: call, args: [] })).rejects.toBe(failure);
      expect((await first.continuation.assembly.consumer.inspect(first.continuation.scope)).state).toBe("pending");
      await first.continuation.close();
      const reopened = await open();
      await expect(reopened.tools.invoke({ receiver: undefined, callback: call, args: [] })).rejects.toThrow("execution_admission.execution_blocked");
      const rows = await lease.database.all<{ value: number }>("select value from actual_tool_counter");
      expect(rows).toEqual([{ value: 1 }]);
    } finally {
      await controller.close();
      await required.close();
      await lease.release();
    }
  });
});
