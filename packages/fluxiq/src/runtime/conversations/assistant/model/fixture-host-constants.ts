/** The environment variable that, with the fixture marker, lets the assistant answer from a script. Never set on a normal panel. */
export const PANEL_ASSISTANT_SCRIPT_ENV = "FLUXIQ_E2E_SCRIPTED_ASSISTANT";

/** The file in the data directory that marks it as the e2e fixture host; the seed writes it (`apps/web/e2e/support/seed-fixtures.mjs`). */
export const PANEL_ASSISTANT_FIXTURE_MARKER_FILE = ".fluxiq-e2e-fixture-root";

/** What that file holds. */
export const PANEL_ASSISTANT_FIXTURE_MARKER = "fluxiq-e2e-fixture-v1";

/** The script a browser test writes, in the fixture's data directory. */
export const PANEL_ASSISTANT_SCRIPT_FILE = "e2e-assistant-script.json";
