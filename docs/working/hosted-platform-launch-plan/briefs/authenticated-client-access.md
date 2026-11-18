# Remove default authenticated-client locking

- Role: heavy worker, gpt-6.1-sol, max. First pass read-only design; no agents/git/builds.
- User correction: authenticated/approved clients must be immediately usable; no default locked/first-unlock state or second unlock ceremony, in Core or extension. This supersedes the lead's locked-by-default design and conflicting earlier plan recommendations.
- Own only: reports/authenticated-client-access.md. Read prior custody report but revise its defaults, not defend them.
- Trace exact Core key custody/pairing/model-access/first-unlock ownership, supplied actual approval session, encrypted at-rest records, existing server-owned wrapping and login. Inspect downstream locked UI/protocol only as needed; no runtime data/secrets.
- Determine complete implementation path that grants authenticated clients their authorized owner's configured model access automatically, including keys configured before/after pairing and reconnect/restart. No cosmetic hiding of a blocked backend.
- Preserve tenant/user isolation, explicit account/client revocation, normal API/IAM and unavailable-provider configuration errors. Authentication cannot give another person's key or platform operator secrets. Missing configured key is not a locked connection.
- Actual approving user's authenticated custody may authorize delegation; do not retain earlier blanket 'never seed a holder from the approving session' as a user rule. Still never borrow an unrelated user/session just because it is convenient.
- No additional password/PIN solely for an already authenticated client. If password-only historical encryption lacks recovery material, identify the necessary real migration/host-owned wrapping design; do not claim decrypting unavailable ciphertext or silently deleting keys.
- Return exact small file-owned implementation units, backend semantics, wire/UI changes, encrypted at-rest migration and meaningful real acceptance (immediate operation after approval; reboot/reconnect; no-key -> later configuration; revoke/disabled/cross-user negative cases).
- Generic credential/crypto belongs Core; browser UX adapters stay downstream. Current HTTP/discovery source is frozen for lead verification; do not modify any source yet.
- End with Outcome/Changed/Validation/Not verified/Report/Notes. Short conclusions and explicit residual constraints, not an argument to keep default locks.
