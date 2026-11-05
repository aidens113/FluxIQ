# Docs update for the model key rework

## Outcome
Done.

## What changed
- Core `reports/model-key-unlock.md` threat model: two rows added (administrator minting a session; local-profile paired snapshot listing browsers and pairing codes), both not defended, low. The expired-session and bearer-only-thief lines were already stated (rows "A stolen session after the person changes their password" and "A current credential alone"), so nothing added.
- Extension `docs/working/hosted-production-plan.md`: "From Core" bullet (approvingSessionId not audit only, own unlock, waiting), Gateway use paragraph (own unlock only, wrapped copies at rest, 14-day previous credential, reuse revoke and audit built, email not built, revoke-all note, new chat line), Locked keys risk rewritten, new hosted launch check for `FluxIQUserAccess` pairing (functional).
- Extension `docs/user/quickstart.md`: unlock passage rewritten. The save-key PIN wording is correct (code asks for PIN there when set), so left as is.
- Core `platform.md` and `client-gateway.md`: already describe the new behaviour; no change.

## Not found in the plan (the plan is 774 lines, structure changed)
No "Unlock" section with "H2 adds a browser-held unwrap key", no N4 sentence, no "row 10 / line 571" wrapped-copies item, no old "restart locks every key" text beyond the Risks bullet. Their content was folded into the Gateway use paragraph instead.

## Commands
See the audit results in the return contract.
