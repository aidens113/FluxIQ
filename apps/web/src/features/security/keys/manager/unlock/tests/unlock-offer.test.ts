import { describe, expect, it } from "vitest";
import { readUnlockTicket, unlockOffer } from "../unlock-offer";

const never = { holderId: "paired-client:never", label: "Chrome on Windows", neverUnlocked: true };
const before = { holderId: "paired-client:before", label: "Edge on Windows", lastUsedAtMs: 5 };

describe("what the keys page offers to unlock", () => {
  it("never offers a browser nobody has unlocked, even when it is the only one", () => {
    expect(unlockOffer([never], undefined)).toEqual({ choosable: [], waiting: [never], only: undefined });
  });

  it("offers it to the person who came from it, by name", () => {
    expect(unlockOffer([never], { ticket: "t", holderId: never.holderId })).toEqual({ choosable: [never], waiting: [], only: never });
  });

  it("a ticket for some other browser changes nothing", () => {
    expect(unlockOffer([never], { ticket: "t", holderId: "paired-client:other" })).toEqual({ choosable: [], waiting: [never], only: undefined });
  });

  it("offers one unlocked before, and lets the person choose among several", () => {
    expect(unlockOffer([before, never], undefined)).toEqual({ choosable: [before], waiting: [never], only: before });
    const another = { ...before, holderId: "paired-client:another" };
    expect(unlockOffer([before, another], undefined).only).toBeUndefined();
  });
});

describe("the ticket in the page's address", () => {
  it("names the browser it came from", () => {
    expect(readUnlockTicket("#unlock=paired-client%3Aone.secretpart")).toEqual({ ticket: "paired-client:one.secretpart", holderId: "paired-client:one" });
  });

  it.each(["", "#", "#other=1", "#unlock=", "#unlock=noseparator"])("is nothing in %j", (hash) => {
    expect(readUnlockTicket(hash)).toBeUndefined();
  });
});
