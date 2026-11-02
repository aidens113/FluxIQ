const QUOTED_OR_STEP = /"(?:[^"\\]|\\.)*"|\b([Ss]tep) (\d+)\b/gu;
export function automationStudioFlowDraftSaidInNumbers(said: string, number: (position: number) => number): string {
    return said.replace(QUOTED_OR_STEP, (match, word: string | undefined, position: string | undefined) => word === undefined || position === undefined ? match : `${word} ${number(Number(position))}`);
}
