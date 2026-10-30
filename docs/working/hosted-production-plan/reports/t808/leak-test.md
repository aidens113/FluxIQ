# t808 leak test (lane C0)

Outcome: Done.

Added packages/fluxiq/src/framework/tests/instance-leak.test.ts (group real-sql). No source touched.
Cases: (1) 20 open/use/close cycles on fresh roots: hub subscriberCount back to baseline each cycle, no pool root left, pool count at baseline, no more Timeout/socket/fs/child handles than baseline, every closed FluxIQ WeakRef cleared after forced GC. (2) Two live instances: closing A drops the count by exactly one, B still creates a project. (3) Injected HeldKeys, evict: unlock kept (created via real secretKeys.createKey/unlockSession), instance WeakRef clears, second instance on same root sees unlockedSessionFor(USER); its default close revokes (counts 0, key zeroed). (4) No HeldKeys + evict: unlock revoked and key buffer zeroed.
WeakRefs cleared; no retainer found in source. "Immediate" handle count is not asserted (my own setImmediate showed up transiently).

Results: 3 consecutive runs, 4/4 passed each (~3.8 s). With `this.programs.detach()` commented out: case 1 failed ("expected 1 to be +0", subscriber count), case 2 ("expected 3 to be 2"), case 3 ("expected 4 to be 3"). Line restored; file byte-identical to its pre-test copy.
Not verified: parallel group not run (file is excluded from it by its real-sql tag).
