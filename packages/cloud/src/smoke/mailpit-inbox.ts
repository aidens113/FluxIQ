type SearchAnswer = { messages?: { ID: string }[] };
type MessageAnswer = { Text?: string };

/**
 * Reads the Mailpit sink's API (on its loopback port) for the smoke: waits
 * for the message sent to one address and answers its text. Waiting is
 * bounded by `deadlineMs` because the smoke is a test that must report,
 * not a product path; the failure says what was observed.
 */
export async function waitForMailText(mailUi: string, recipient: string, sleep: (ms: number) => Promise<void>, deadlineMs = 90_000): Promise<string> {
  const query = encodeURIComponent(`to:"${recipient}"`);
  const started = Date.now();
  let observed = "no answer yet";
  while (Date.now() - started < deadlineMs) {
    const search = await fetch(`${mailUi}/api/v1/search?query=${query}`).catch((error: Error) => error);
    if (search instanceof Error) observed = `Mailpit unreachable (${search.message})`;
    else if (!search.ok) observed = `Mailpit answered ${search.status}`;
    else {
      const found = (await search.json()) as SearchAnswer;
      const id = found.messages?.[0]?.ID;
      if (id !== undefined) {
        const message = await fetch(`${mailUi}/api/v1/message/${encodeURIComponent(id)}`);
        if (!message.ok) throw new Error(`Mailpit answered ${message.status} for message ${id}.`);
        return ((await message.json()) as MessageAnswer).Text ?? "";
      }
      observed = "no message for that address";
    }
    await sleep(500);
  }
  throw new Error(`No email reached ${recipient} in Mailpit within ${deadlineMs / 1000} s (${observed}).`);
}
