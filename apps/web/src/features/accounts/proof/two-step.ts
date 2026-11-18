import { createContext } from "react";

/** Whether the signed-in person has two-step sign-in on, so a confirmation also asks for their authenticator code. Off when no page says otherwise. */
export const TwoStepContext = createContext(false);
