import { automationStudioResultScreenedJudgement } from "../judgement-screen.ts";

/**
 * Words a model wrote, through the screen every word a judge wrote passes
 * (`../judgement-screen.ts`), for whoever carries them on: a credential-shaped text
 * is dropped whole, a locator-shaped one rewritten, and `withheld` says either
 * happened.
 */
export function automationStudioFlowLessScreenedWords(text: string): { text?: string; withheld: boolean } {
  const { judgement, withheld } = automationStudioResultScreenedJudgement({ observed: text });
  return { ...(judgement?.observed ? { text: judgement.observed } : {}), withheld };
}
