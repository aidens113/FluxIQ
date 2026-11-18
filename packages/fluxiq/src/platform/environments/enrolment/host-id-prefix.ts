/**
 * What starts an environment's managed host id. An environment id holds no
 * `:`, so the id after the prefix is exactly the environment's, and no host id
 * of the development pool (`host-<n>`) can be mistaken for one.
 */
export const ENVIRONMENT_HOST_ID_PREFIX = "environment:";
