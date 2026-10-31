import { getPlatformRegistry, panelOnboardingCards } from "fluxiq/platform/panel";
import { getFluxIQ } from "../../../lib/fluxiq";
import { ensurePlatformModulesLoaded } from "./ensure-platform-modules-loaded";

/** Whether the workspace holds any model key; the secret-keys snapshot is redacted metadata only. */
async function hasModelKey(): Promise<boolean> {
  try {
    return ((await getFluxIQ().programs.secretKeys.snapshot()).keys?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

/** First-run cards on the signed-in home; nothing at all for the stock panel or when no card applies. */
export async function OnboardingCards() {
  await ensurePlatformModulesLoaded();
  const product = getPlatformRegistry().product();
  if (!product) return null;
  const cards = panelOnboardingCards({ product, hasModelKey: await hasModelKey() });
  if (cards.length === 0) return null;
  return (
    <section aria-label="Getting started" className="onboarding-cards">
      {cards.map((card) => (
        <article className="onboarding-card" key={card.id}>
          <h2>{card.title}</h2>
          <p>{card.body}</p>
          <div className="onboarding-card-actions">
            {card.actions.map((action) => (
              <a className="button button-secondary" href={action.href} key={action.href} {...(action.external ? { rel: "noopener noreferrer", target: "_blank" } : {})}>{action.label}</a>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
