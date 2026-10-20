// Whether a DeepSeek refusal says the account paying for the call has run out
// of money, which is `llm.provider_balance_exhausted` rather than a plain HTTP
// failure.
//
// DeepSeek answers an empty balance with `402 Insufficient Balance`. Before
// this code existed that arrived as `llm.provider_http_error` with status 402,
// and the Lab had to reconstruct "the balance ran out" from the status and the
// step log's raw reply. A refusal under another status whose own code, type or
// sentence says the balance, quota or credit is insufficient means the same and
// is read the same way. Only the provider's screened error fields are read
// (`./refusal.ts`), never the raw body.

/** The provider's own words for an empty account: insufficient balance, quota, credit or funds. */
const BALANCE_WORDS = /insufficient[\s_-]*(?:account[\s_-]*)?(?:balance|quota|credits?|funds)/i;

/** Whether a refusal with this status and these error fields says the account's balance is exhausted. */
export function automationStudioDeepSeekBalanceExhausted(
  status: number,
  error: { code?: unknown; type?: unknown; message?: unknown } | null | undefined
): boolean {
  if (status === 402) return true;
  if (!error) return false;
  return [error.code, error.type, error.message].some((field) => typeof field === "string" && BALANCE_WORDS.test(field));
}
