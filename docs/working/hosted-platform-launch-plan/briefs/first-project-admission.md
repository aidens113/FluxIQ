# First-project durable admission design
Role: Heavy worker, existing cloud_portability configuration.
Goal: Propose an executable bounded implementation for first-project create admission and creator-attribution recovery; inspect owning code first.
Own: report first-project-admission.md only until root approves precise source paths/interface.
Read: remaining-gateway-mutations First-project section, actual public helper/registry, project handler, canonical create reservation and project ownership/repair owners, adjacent tests.
Must not touch: source/shared docs/git/builds/browser/providers.
Required design: trusted non-wire mutation admission at actual first write, no async external authorization under SQL writer lock; mandatory attribution coherent after accepted creation; durable retry identity prevents duplicate first-project after creator-save failure.
Preserve: normal callers, local modes, existing creation engine, owner filtering, no default client lock. No second persistence engine or route-only precheck presented as write admission.
Return: exact additive API and file ownership partition; minimal executable first unit with acceptance commands, integration/version implications and candid limits of cross-store authority. Trace/account/session foundation files remain frozen.
No tests necessary for read-only source discovery; label conclusions as design, not runtime acceptance. Standard return contract.
