/**
 * The labels every Docker resource of an environment carries: the
 * deployment's project (which `fluxiq-cloud down` removes by) and the
 * environment, which `inspect` and `release` find its resources by.
 */
export const DOCKER_ENVIRONMENT_LABELS = Object.freeze({
  project: "com.fluxiq.cloud.project",
  environment: "com.fluxiq.cloud.environment",
  role: "com.fluxiq.cloud.role"
});
