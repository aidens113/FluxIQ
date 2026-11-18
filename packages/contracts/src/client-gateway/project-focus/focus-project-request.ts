/**
 * `client.focus_project`: the project the person is working in now. Core moves
 * the session's project to it (so that project's `server.activity` reaches the
 * session) only for a ready session a person paired and a project that person
 * may read in the session's domain; `null` returns to the project the session
 * was bound to when it became ready. Answered by `server.project_focused`, or by
 * `server.error` with a `CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES` code and the
 * session unchanged, each with the request's id as `correlationId`.
 */
export type ClientGatewayFocusProjectRequest = { projectId: string | null };
