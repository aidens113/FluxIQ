/**
 * The scripts the smoke runs in one-shot containers. Each reads its input as
 * JSON on standard input and prints JSON; a secret (the provisioning token,
 * the Stripe key) arrives only that way.
 */
export const SMOKE_SCRIPTS = {
  /** Calls the provisioning listener as a sign-up site's backend does: `POST /provisioning/<operation>` with the bearer token. */
  provision: `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const answers = [];
for (const call of input.calls) {
  const response = await fetch("http://" + input.address + ":4780/provisioning/" + call.operation, {
    method: "POST",
    headers: { authorization: "Bearer " + input.token, "content-type": "application/json" },
    body: JSON.stringify(call.body)
  });
  answers.push({ status: response.status, body: await response.json().catch(() => null) });
}
process.stdout.write(JSON.stringify(answers));
`,
  /** Asks the payments API (stripe-mock) for customers with the deployment's key. */
  payments: `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const response = await fetch(input.apiBase + "/v1/customers?limit=1", { headers: { authorization: "Bearer " + input.key } });
const body = await response.json().catch(() => null);
process.stdout.write(JSON.stringify({ status: response.status, object: body && body.object }));
`
} as const;
