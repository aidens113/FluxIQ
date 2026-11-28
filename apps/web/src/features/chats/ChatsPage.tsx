"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { useProjectList } from "../automation-studio/project";
import { useLoaded } from "../flows";
import { PublishPanelPage, usePanelContext } from "../panel-shell";
import { chatRows } from "./chat-rows";
import { useReloadOnChatChanges } from "./use-reload-on-chat-changes";
import { CHATS_PAGE_SIZE, loadChats } from "./load-chats";
import "./chats.css";

/** Every chat, in the current project or in all of them, each opening as a full page. Earlier chats with no project show with all projects. */
export function ChatsPage() {
  const studio = useProgramTransport("automation-studio");
  const { context } = usePanelContext();
  const [scope, setScope] = useState<"current" | "all">("current");
  const [limit, setLimit] = useState(CHATS_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const projectId = scope === "current" ? context.projectId ?? null : null;
  const projects = useProjectList();
  const chats = useLoaded(`${projectId ?? "*"}|${limit}`, useCallback((signal: AbortSignal) => loadChats(studio, projectId, limit, signal), [studio, projectId, limit]));
  useReloadOnChatChanges(chats.reload);
  const names = useMemo(() => new Map(projects.state === "ready" ? projects.projects.map((project) => [project.id, project.name] as const) : []), [projects]);
  const rows = chats.state === "ready" ? chatRows(chats.data, names, search) : [];
  const canLoadMore = chats.state === "ready" && chats.data.length >= limit;
  return (
    <div className="chats">
      <PublishPanelPage page="chats" />
      <h1>Chats</h1>
      <div className="chats-tools">
        {context.projectId ? (
          <label className="chats-field">
            <span>Show</span>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as "current" | "all");
                setLimit(CHATS_PAGE_SIZE);
              }}
            >
              <option value="current">Chats in the current project</option>
              <option value="all">Chats in all projects</option>
            </select>
          </label>
        ) : <p className="chats-note">Showing chats in all projects. Choose a project in the top bar to narrow them.</p>}
        <label className="chats-field">
          <span>Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a chat by name or project" />
        </label>
      </div>
      <section aria-label="Chats" aria-busy={chats.state === "loading"}>
        {chats.state === "loading" ? <p className="chats-note">Loading the chats…</p> : null}
        {chats.state === "error" ? (
          <p className="chats-note chats-error" role="alert">
            The chats could not be loaded: {chats.message} <button type="button" onClick={chats.reload}>Try again</button>
          </p>
        ) : null}
        {chats.state === "ready" && rows.length === 0 ? (
          <p className="chats-note">{chats.data.length === 0 ? "There are no chats here yet. Open the chat and ask for something to start one." : "No chat matches that search."}</p>
        ) : null}
        {rows.length ? (
          <ul className="chats-rows">
            {rows.map((row) => (
              <li key={row.conversationId} className="chats-row">
                <div className="chats-row-main">
                  <Link className="chats-row-name" href={row.href}>{row.title}</Link>
                  <span className="chats-muted">
                    {row.projectName} · {row.status === "open" ? "Open" : "Resolved"} · {row.turns} {row.turns === 1 ? "message" : "messages"}
                    {row.waiting > 0 ? ` · waiting on you (${row.waiting})` : ""} · {new Date(row.updatedAt).toLocaleString()}
                  </span>
                </div>
                <Link className="chats-button" href={row.href} aria-label={`Open ${row.title}`}>Open</Link>
              </li>
            ))}
          </ul>
        ) : null}
        {canLoadMore ? <button type="button" className="chats-button" onClick={() => setLimit((was) => was + CHATS_PAGE_SIZE)}>Show older chats</button> : null}
      </section>
    </div>
  );
}
