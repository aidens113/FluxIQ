// Where the chat says work is tried: a site's name, never an address. What is
// pinned: a public site reads as its host without `www.`; a page served from
// this machine or an IP address, which no person would call a site, reads as
// "the page you had open"; with no page at all, "the website".

import { describe, expect, it } from "vitest";
import { automationStudioConversationSiteName } from "../site-name.ts";

describe("the site a chat reply names", () => {
  it("is the host without www., with no scheme, path or query", () => {
    expect(automationStudioConversationSiteName("https://www.amazon.com/s?k=x")).toBe("amazon.com");
    expect(automationStudioConversationSiteName("https://shop.example.com/kettles?token=secret#top")).toBe("shop.example.com");
    expect(automationStudioConversationSiteName("http://WWW.Example.ORG")).toBe("example.org");
  });

  it("is the page the person had open for an IP address or this machine", () => {
    for (const address of ["http://127.0.0.1:4100/scenarios/a", "http://localhost:3000/", "http://app.localhost/x", "http://[::1]:8080/", "https://192.168.1.20/admin", "ftp://x", "not a url"]) {
      expect(automationStudioConversationSiteName(address)).toBe("the page you had open");
    }
  });

  it("is the website when no page was sent", () => {
    expect(automationStudioConversationSiteName(null)).toBe("the website");
    expect(automationStudioConversationSiteName(undefined)).toBe("the website");
    expect(automationStudioConversationSiteName("")).toBe("the website");
  });
});
