/**
 * Written on a Flow whose `trainingModeSettings.budgets.maxTokensPerRun` can no
 * longer be the token cap Core once wrote into every new Flow.
 *
 * Until 2026-09-30 the default Flow settings (`../flows.ts`) carried
 * `maxTokensPerRun: 12000`, which held an unattended recovery to 12,000 tokens
 * and refused a whole page's diagnosis outright. The user's order that day was
 * to remove every limit on what the model is passed: the model's own context
 * window is the only bound on a request, and the run cost ceiling (then $0.25;
 * now `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, $0.10 by default) the bound
 * on spending. So the default carries no token cap, and a stored Flow that
 * still holds exactly 12,000 has it cleared where it is read
 * (`runtime/service/flow-settings/tokens-per-run-default-migration.ts`).
 *
 * The web settings form never saved 12,000 as a person's choice -- it saved only
 * a value that differed from it -- so a stored 12,000 without this key is always
 * the default. The key says the clearing is done or was never needed: a new Flow
 * is created with it, a cleared Flow is given it, and the settings form writes
 * it on every save, so a 12,000 a person sets from now on is theirs and stays.
 */
export const AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY = "tokensPerRunDefaultCleared";
