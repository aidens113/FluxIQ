import type { ExecutionEntryIssuer } from "../entry/index.ts";
import type { ExecutionAdmissionProducer } from "../producer.ts";

export interface ExecutionSourcePorts {
  readonly issuer: ExecutionEntryIssuer;
  readonly producer: ExecutionAdmissionProducer;
}
