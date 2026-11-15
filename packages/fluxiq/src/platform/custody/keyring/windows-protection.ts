import { spawnSync } from "node:child_process";

/** Local Windows custody is encrypted by DPAPI for the host's OS account. No secret in argv. */
export function windowsProtectKeyring(input: Buffer, operation: "Protect" | "Unprotect"): Buffer {
  const script = `Add-Type -AssemblyName System.Security; $data = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $result = [System.Security.Cryptography.ProtectedData]::${operation}($data, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
    input: input.toString("base64"), encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024
  });
  // Do not surface subprocess output: even a host failure must not disclose key material.
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error("Windows host key protection is unavailable.");
  return Buffer.from(result.stdout.trim(), "base64");
}
