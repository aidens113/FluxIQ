

/**
 * Whether taking the action changes anything, in the same two words the node
 * registry, the harness options and the evidence loop already use.
 *
 * `observe` is a promise the domain makes about its own action -- it reads,
 * waits or asserts, and the page and everything behind it is as it was
 * afterwards. `mutate` is everything else, and is what an unstated effect
 * means. A newer resolved `actionEffect` can raise the client floor; its
 * known consequences and commit class take precedence over this legacy word.
 */
export type AutomationStudioActionEffect = "observe" | "mutate";
