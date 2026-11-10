import { automationStudioAnswerFirstPageWord } from "./page-word.ts";

/** An address as the view it shows and where in it, page words apart: the fragment and the order of its query say neither. */
export function automationStudioAnswerFirstAddressSplit(address: string): { view: string; place?: string } {
  if (!URL.canParse(address)) return { view: address };
  const url = new URL(address);
  const places: string[] = [];
  const kept: string[] = [];
  for (const [name, value] of [...url.searchParams].sort(([one], [other]) => one.localeCompare(other))) {
    const word = automationStudioAnswerFirstPageWord(name);
    if (word === "place") places.push(`${name.toLowerCase()}=${value}`);
    else if (!word) kept.push(`${name}=${value}`);
  }
  const inPath = /\/page\/(\d{1,9})(?=\/|$)/iu.exec(url.pathname);
  if (inPath) places.push(`page=${inPath[1]}`);
  const path = (inPath ? url.pathname.replace(inPath[0], "") : url.pathname).replace(/\/+$/u, "");
  return { view: `${url.protocol}//${url.host}${path}?${kept.join("&")}`, ...(places.length ? { place: places.join("&") } : {}) };
}
