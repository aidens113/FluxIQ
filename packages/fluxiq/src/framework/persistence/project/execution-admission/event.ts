import type { ExecutionAdmissionRows } from "./rows.ts";
export interface ExecutionAdmissionEvent {
    eventId: string;
    mutationId: string;
    ownerId: string;
    operation: "open" | "reserve" | "enter" | "append" | "finish" | "release" | "command_link";
    request: unknown;
    changes: Array<{
        table: keyof ExecutionAdmissionRows;
        key: string;
        value: ExecutionAdmissionRows[keyof ExecutionAdmissionRows];
    }>;
    proofDigest: string;
}
