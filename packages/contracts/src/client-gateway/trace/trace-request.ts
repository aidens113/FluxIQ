/**
 * On a traced action command's `metadata.trace`. `scope` names the trace the
 * command is recorded into: a client that skips re-uploading what it already
 * sent keeps one such record per scope, so every trace holds each artifact its
 * results reference.
 */
export type ClientGatewayTraceRequest = { artifacts: true; scope?: string };
