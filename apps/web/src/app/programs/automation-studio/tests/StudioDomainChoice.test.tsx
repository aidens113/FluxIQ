import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StudioDomainChoice } from "../StudioDomainChoice";

it("links each installed domain to Studio in that domain, keeping the rest of the link", () => {
  const domains = [{ id: "web", title: "Web", description: "Web domain" }, { id: "shop", title: "Shop", description: "Shop domain" }];
  const html = renderToStaticMarkup(<StudioDomainChoice domains={domains} query={{ project: "p", domainId: "gone" }} />);
  expect(html).toContain("href=\"/programs/automation-studio?domainId=web&amp;project=p\"");
  expect(html).toContain("href=\"/programs/automation-studio?domainId=shop&amp;project=p\"");
  expect(html).toContain("Choose a domain");
});
