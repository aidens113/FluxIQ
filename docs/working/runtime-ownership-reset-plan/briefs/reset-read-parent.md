# Original parent on reset baseline reads

- Owner: lead, separate defect unit; not part of the SQL move or callback guard batch.
- Finding: service/project-build/brief-ports.ts placing drops its actual bound call when invoking reader.capture and site-reset/act-places drops that call on reader.read/settled. The existing StartCheck already accepts invocation arguments and the producer can otherwise fall back to ordinary-root admission.
- Owned source: those two files only; new immediate site-reset test. Other writers must not touch them.
- Preserve original call identity, read starts/signals/receivers, capture order, run count, original returns/errors, settle/ledger semantics and legacy unobserved path. Pass the actual call into existing invocation slots; no new scope/source/authority/registration.
- Add a genuine original observer/entered Core body regression with the actual StartCheck. Prove reads stay under its root and successful managed passive reads do not create another ordinary root. Retain all existing act-places/start-check tests.
- Run red before the two source edits, green after, only at common frozen runtime window. Add actual unsupported-read write/throw/reopen negative where the original observer fixture supports it without changing the callback policy.
- The source gap is established; it is NOT proven to be the composed stall's cause. Original composed acceptance and elapsed measurement remain required.
- Report validation and exact limits in the shared plan ledger; no provider/browser/user data involved.
