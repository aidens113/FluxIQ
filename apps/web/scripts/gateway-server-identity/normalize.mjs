const PLACEHOLDER = Buffer.from('{"fluxiqServerIdentityPlaceholder":310}').toString("base64");
/** Normalize exactly one payload literal, retaining every surrounding executing byte. */
export function serverIdentitySlot(text, identity) {
  const matches = [...text.matchAll(/(["'])__FLUXIQ_SERVER_IDENTITY_BEGIN__([^"']*)__FLUXIQ_SERVER_IDENTITY_END__\1/g)];
  if (matches.length !== 1 || [...text.matchAll(/["']__FLUXIQ_SERVER_IDENTITY_BEGIN__/g)].length !== 1 || [...text.matchAll(/__FLUXIQ_SERVER_IDENTITY_END__["']/g)].length !== 1) throw new Error("Server identity needs exactly one embedded slot.");
  const [literal, , encoded] = matches[0];
  if (!/^[A-Za-z0-9+/=]+$/.test(encoded) || Buffer.from(encoded, "base64").toString("base64") !== encoded) throw new Error("Malformed server identity encoding.");
  const value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const placeholder = value?.fluxiqServerIdentityPlaceholder === 310 && Object.keys(value).length === 1;
  if (!placeholder && (value?.schema !== 1 || value.protocol !== "fluxiq.module-build-identity.v1" || value.moduleId !== "fluxiq/web-client-gateway-server" || value.normalization !== "module-payload-v1"
    || typeof value.version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,79}$/.test(value.version) || Object.keys(value).length !== 7
    || !/^[a-f0-9]{64}$/.test(value.artifactDigest) || !/^[a-f0-9]{64}$/.test(value.sourceInputsDigest))) throw new Error("Malformed server identity payload.");
  const payload = identity ? Buffer.from(JSON.stringify(identity)).toString("base64") : PLACEHOLDER;
  return text.replace(literal, JSON.stringify("__FLUXIQ_SERVER_IDENTITY_BEGIN__" + payload + "__FLUXIQ_SERVER_IDENTITY_END__"));
}
