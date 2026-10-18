import type { ComponentProps, ReactNode } from "react";
import { GlobalTopbar } from "../AuthShell";

export type GetStartedFrameProps = {
  user: ComponentProps<typeof GlobalTopbar>["user"];
  title: string;
  copy: string;
  children: ReactNode;
};

/**
 * The page chrome every first-run setup screen shares, matching the other
 * top-level pages: the signed-in topbar, the directory container, and a
 * heading. The route's own stylesheet is loaded by `layout.tsx`.
 */
export function GetStartedFrame(props: GetStartedFrameProps) {
  return <main className="directory-page">
    <GlobalTopbar user={props.user} />
    <div className="directory-container">
      <header className="directory-heading">
        <p className="page-kicker">Get started</p>
        <h1 className="page-title">{props.title}</h1>
        <p className="page-copy">{props.copy}</p>
      </header>
      <div className="get-started-body">{props.children}</div>
    </div>
  </main>;
}
