"use client";

import { useState } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { CurrentUser } from "../../programs/types";
import { ChangePasswordDialog } from "./change-password";
import { identityCall, type IdentityPost } from "./identity-call";
import { OwnSignInNameCase } from "./OwnSignInNameCase";
import { SignOutButton } from "./SignOutButton";
import { TwoStepOffDialog, TwoStepSetupDialog } from "./two-step";

type Dialog = "password" | "two-step-on" | "two-step-off" | null;

/**
 * The signed-in person's own sign-in, in plain words: their name, Change
 * password, two-step sign-in (an authenticator code at sign-in, optional) and
 * Sign out. Users, roles and policy are one step away under "Advanced access
 * controls". `post` stands in for the identity-access program in tests.
 */
export function YourSignIn(props: { user: CurrentUser & { username?: string | undefined }; post?: IdentityPost }) {
  const api = useProgramApi("identity-access");
  const post: IdentityPost = props.post ?? ((endpoint, payload) => api.post(endpoint, payload));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [twoStep, setTwoStep] = useState(props.user.totpEnabled);
  const [username, setUsername] = useState(props.user.username);
  const [notice, setNotice] = useState("");
  const close = () => setDialog(null);
  const open = (which: Dialog) => () => {
    setNotice("");
    setDialog(which);
  };
  const finish = (message: string, twoStepNow: boolean) => () => {
    close();
    setTwoStep(twoStepNow);
    setNotice(message);
  };

  async function recase(next: string): Promise<string | null> {
    const result = await identityCall(post, "recase-my-username", { username: next });
    if (!result.ok) return result.error || "Your sign-in name could not be changed.";
    setUsername(next);
    setNotice("Sign-in name updated.");
    return "";
  }

  return (
    <section className="security-section" aria-labelledby="security-sign-in">
      <h2 id="security-sign-in">Your sign-in</h2>
      <div className="security-row">
        <span className="security-title">{props.user.displayName}</span>
        {username ? <span className="security-muted">Sign-in name: {username}</span> : null}
        {username ? <OwnSignInNameCase busy={false} save={recase} username={username} /> : null}
      </div>
      {notice ? <p className="security-note" role="status">{notice}</p> : null}
      <div className="security-row">
        <span className="security-title">Password</span>
        <span className="security-action"><button className="button" onClick={open("password")} type="button">Change password</button></span>
      </div>
      <div className="security-row">
        <span className="security-title">Two-step sign-in</span>
        <span className="security-muted">{`Ask for a code from an authenticator app when you sign in. It is ${twoStep ? "on" : "off"}.`}</span>
        <span className="security-action">
          {twoStep
            ? <button className="button" onClick={open("two-step-off")} type="button">Turn off two-step sign-in</button>
            : <button className="button" onClick={open("two-step-on")} type="button">Set up two-step sign-in</button>}
        </span>
      </div>
      <div className="security-row">
        <span className="security-title">This browser</span>
        <SignOutButton />
      </div>
      <p className="security-note"><a href="/security/advanced">Advanced access controls</a>: users, roles and sign-in rules.</p>
      {dialog === "password" ? <ChangePasswordDialog userId={props.user.id} twoStep={twoStep} post={post} onClose={close} onChanged={finish("Password changed.", twoStep)} /> : null}
      {dialog === "two-step-on" ? <TwoStepSetupDialog userId={props.user.id} post={post} onClose={close} onDone={finish("Two-step sign-in is on.", true)} /> : null}
      {dialog === "two-step-off" ? <TwoStepOffDialog userId={props.user.id} post={post} onClose={close} onDone={finish("Two-step sign-in is off.", false)} /> : null}
    </section>
  );
}
