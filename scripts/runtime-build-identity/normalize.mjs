const SLOT = /(?<=\/\* core-runtime-identity:start \*\/\s*const embedded = )(['"])(?:\\.|(?!\1)[^\\])*\1(?=;\s*\/\* core-runtime-identity:end \*\/)/gu;
const PLACEHOLDER = JSON.stringify('{"fluxiqRuntimeIdentityPlaceholder":302}');
/** Only payload literal bytes are excluded; executable reader semantics remain hashed. */
export function normalizedIdentityReader(source, replacement = PLACEHOLDER) {
  if ((source.match(/core-runtime-identity:start/gu) ?? []).length !== 1 || (source.match(/core-runtime-identity:end/gu) ?? []).length !== 1
    || [...source.matchAll(SLOT)].length !== 1) throw new Error("Runtime identity reader must contain exactly one valid payload slot.");
  return source.replace(SLOT, () => replacement);
}
