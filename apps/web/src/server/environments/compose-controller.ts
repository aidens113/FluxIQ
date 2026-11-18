import { EnvironmentController } from "fluxiq/platform";
import { createTenantEnrolment } from "./tenant-enrolment";
import type { EnvironmentControllerComposition } from "./types";

/**
 * The web server's dedicated-environment controller: the injected admission
 * and IAM resolver, the durable store, the driver, and enrolment at each
 * environment's own tenant gateway. The `local-process` driver isolates
 * nothing between tenants and the `fake` driver allocates nothing, so the
 * `service` profile refuses both.
 */
export function composeEnvironmentController<Actor>(composition: EnvironmentControllerComposition<Actor>): EnvironmentController<Actor> {
  if (composition.profile === "service" && (composition.driver.kind === "local-process" || composition.driver.kind === "fake")) {
    throw new Error(`environments.driver_refused: the ${composition.driver.kind} driver gives no customer an isolated environment, so the service profile cannot use it.`);
  }
  return new EnvironmentController<Actor>({
    store: composition.store,
    driver: composition.driver,
    admission: composition.admission,
    authorize: composition.authorize,
    enrolment: createTenantEnrolment({
      acquire: composition.acquire,
      store: composition.store,
      routes: composition.routes,
      domainId: composition.domainId,
      ...(composition.ttlMs !== undefined ? { ttlMs: composition.ttlMs } : {})
    })
  });
}
