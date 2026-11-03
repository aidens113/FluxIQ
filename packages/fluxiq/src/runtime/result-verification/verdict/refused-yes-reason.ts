/** Why a yes was not taken, by what Core found it passed over. */
export function refusedYesReason(unaccounted: boolean, keptNumber: boolean, unquoted: boolean): string {
  const said = [
    ...(unaccounted ? ["without saying why the request excludes each row a condition alone left out that names the item asked for"] : []),
    ...(unquoted ? ["without quoting, beside each row a condition alone left out, words of the request that exclude it"] : []),
    ...(keptNumber ? ["over rows a text condition alone left out that state a number the same condition kept on another row"] : [])
  ];
  return `The result was judged to answer the request ${said.join(", and ")}, so it is not taken as an answer.`;
}
