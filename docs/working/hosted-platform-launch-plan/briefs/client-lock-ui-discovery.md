# Authenticated-client lock protocol and UI removal

- Role: heavy worker, gpt-6.1-sol, max. Read-only source, no agents/git/builds/tests.
- User explicitly requires no default locking or second unlock for authenticated clients, Core and extension. This supersedes previous first-unlock/locked-enrollment design. Backend replacement is owned by browser_trust's separate investigation.
- Own only reports/client-lock-ui-discovery.md under this plan directory.
- Locate shared status/error/event contracts and all Core web/shared UI/downstream extension presentations or operations for first-unlock/client-key locks. Include pairing approval forms, prompt/banner/action handlers, settings and model-key status.
- Read Current State correction and authenticated-client-access brief. Downstream is paired fxwork/t914/!FluxIQWebExtension, never primary dirty worktree.
- Return exact file-owned removal partitions, public wire compatibility implications, meaningful test owners and a proposed truthful status model for ready/missing configured key/provider failure/revoked authentication.
- No cosmetic hiding of a backend lock. No duplicate password/PIN for approved clients. Do not sweep unrelated recording/UI mutex/network 'blocked' states into this change.
- Distinguish deliberate revocation from a still-authenticated but artificially locked client. Ordinary panel logout cannot silently leave independent approved client access half-working.
- Keep source frozen through lead HTTP/types checkpoint. End with Outcome/Changed/Validation/Not verified/Report/Notes.
