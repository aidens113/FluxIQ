import type { ReactNode } from "react";
import { ConfirmButton } from "../confirm";
import type { ChangeResult } from "../data";
import type { AccessRows, SessionRow } from "../model";

function Sessions(props: { sessions: SessionRow[]; onRevoke: (digest: string) => Promise<ChangeResult>; onDone: () => void }) {
  if (props.sessions.length === 0) return <span className="security-muted">Not signed in anywhere.</span>;
  return (
    <ul className="security-sessions" aria-label="Sign-in sessions">
      {props.sessions.map((session) => (
        <li key={session.digest} className="security-session">
          <span className="security-muted">Signed in, ends {session.expiresAt === undefined ? "at an unknown time" : new Date(session.expiresAt).toLocaleString()}</span>
          <ConfirmButton label="Sign out" question="Sign this session out?" confirmLabel="Sign out" onConfirm={() => props.onRevoke(session.digest)} onDone={props.onDone} />
        </li>
      ))}
    </ul>
  );
}

/**
 * People, their roles and their sign-in sessions. For an administrator,
 * `actions` adds each person's access controls (role, turn off or on, remove)
 * and `admin` fills the place at the end (inviting people, invites waiting);
 * without them, as for anyone else, the list only shows.
 */
export function PeopleList(props: { access: AccessRows; onRevoke: (digest: string) => Promise<ChangeResult>; onDone: () => void; actions?: ((personId: string) => ReactNode) | undefined; admin?: ReactNode }) {
  const { people, otherSessions } = props.access;
  return (
    <>
      {people.length === 0 ? <p className="security-note">No people are listed.</p> : (
        <ul className="security-list" aria-label="People">
          {people.map((person) => (
            <li key={person.id} className="security-row">
              <span className="security-title">{person.name}</span>
              <span className="security-muted">{person.username} · role {person.roleId}{person.enabled ? "" : " · turned off"}</span>
              {person.permissions.length > 0 ? <span className="security-muted">Can: {person.permissions.join(", ")}</span> : null}
              <Sessions sessions={person.sessions} onRevoke={props.onRevoke} onDone={props.onDone} />
              {props.actions?.(person.id) ?? null}
            </li>
          ))}
        </ul>
      )}
      {otherSessions.length > 0 ? (
        <div className="security-row">
          <span className="security-title">Other sessions</span>
          <Sessions sessions={otherSessions} onRevoke={props.onRevoke} onDone={props.onDone} />
        </div>
      ) : null}
      <div className="security-section" data-slot="access-admin">{props.admin ?? null}</div>
    </>
  );
}
