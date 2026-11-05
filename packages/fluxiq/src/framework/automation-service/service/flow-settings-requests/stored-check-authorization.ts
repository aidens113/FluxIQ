/**
 * A client's write never sets a Flow's standing result-check authorization: that record
 * says whose key pays, so a person who can edit a Flow must not be able to name someone
 * else's. Whatever is stored stays exactly as it is.
 */
export function withStoredCheckAuthorization(merged: Record<string, any>, stored: Record<string, any> | undefined): Record<string, any> {
  const training = merged.trainingModeSettings;
  if (!training || typeof training !== "object" || Array.isArray(training)) return merged;
  const check = training.resultCheck;
  const kept = stored?.trainingModeSettings?.resultCheck?.authorization;
  if ((!check || typeof check !== "object" || Array.isArray(check)) && kept === undefined) return merged;
  const { authorization: _fromTheClient, ...rest } = check && typeof check === "object" && !Array.isArray(check) ? check : {};
  return { ...merged, trainingModeSettings: { ...training, resultCheck: { ...rest, ...(kept === undefined ? {} : { authorization: kept }) } } };
}
