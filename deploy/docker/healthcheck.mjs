// The image's HEALTHCHECK: asks the panel on loopback for one path (default
// /api/health) and exits 0 only on a 2xx answer. The port is the panel's
// (PORT, as the standalone server reads it). Docker's --timeout bounds the
// whole check, so no timer is set here. Nothing from the answer is printed.

const path = process.argv[2] ?? "/api/health";
const port = process.env.PORT?.trim() || "3000";

try {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
  process.exitCode = response.ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}
