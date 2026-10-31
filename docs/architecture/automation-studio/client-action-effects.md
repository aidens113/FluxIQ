# Trusted client action effects

Core 0.17 adds `AutomationStudioNodeDefinition.actionEffect` to the canonical
registered node contract. Its `effectClass` is `observe`, `state` or `commit`;
optional `permissionConsequences` uses the existing closed consequence classes.
This is trusted client registration data. Graph/model metadata cannot supply
or lower it. Older definitions without this field retain their legacy behavior.

The optional `commitWhen` names a declared boolean parameter. An explicit false,
or a false schema default when the parameter is truly absent, retains the base
class. True, unresolved bindings and invalid/missing values conservatively
resolve to commit. Known permission consequences also require commit. Raw slots
must survive plan projection so unresolved values cannot acquire a false default.

Optional `repeatSafe: true` is a separate trusted promise that repeating the
resolved state-setting operation is idempotent. State alone makes no such
promise. Conditional elevation to commit, known permission classes and declared
lasting consequences outrank this promise. Combining floors retains it only
when every state-contributing floor explicitly supplies it. Commit can never
be made repeatable through this field or model metadata.

The browser-safe public `fluxiq/automation-studio/action-effect` subpath exports
the contracts, strict readers, resolver and floor combination helper without
loading the executor. `AutomationStudioNativeNodeRuntime.resolveActionEffect`
and the canonical graph-options factory bind registered native/output floors.
Hosts using custom execution supply the trusted `resolveActionEffect` option;
outside-graph dispatch accepts a separate resolved `actionEffect` argument.

Execution retains resolved floors per invocation frame and logical node pass,
before dispatch, including thrown acknowledgements and synthetic timeouts. A
later loop pass specializes its own parameters. A committing action with an
unknown effect is checked and held before retries or alternatives; landed settles
once, while proven unacted/not-landed retains the first attempt plus three
retries. Successful dispatch rejected by later verification is not dispatched
again. A preparation timeout cancels subsequent late dispatch.

Child `run.outcome_uncertain` is terminal through Call Flow and Subflow
boundaries. It stops whole-child retries and parent alternatives before a
parent effect check can reinterpret the child's action. A latched required run
returns this terminal result without a further checkpoint; other checkpoint
refusals retain their normal behavior.

Permission checks union registered classes with the declaration before observe
exemptions, requests and records. Plan publication, repair and interruption
learning preserve that accepted union. A client class without a grounded
permission declaration blocks publication rather than inventing a target or
grant. A commit class alone invents no money, deletion or publication permission,
and introduces no new playback prompt.
