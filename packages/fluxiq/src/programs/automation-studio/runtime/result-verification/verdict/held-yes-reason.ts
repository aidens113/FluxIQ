/** Why a yes was held, by what it left unaccounted for. */
export function heldYesReason(unquoted: boolean, kept: boolean): string {
  const said = [
    ...(unquoted ? ["the required row-local exclusion evidence"] : []),
    ...(kept ? ["a quote of the request beside each row the result keeps that Core measured as unlike every other kept row"] : [])
  ];
  return `The affirmative judgement did not supply ${said.join(", or ")}, so the result remains unconfirmed.`;
}
