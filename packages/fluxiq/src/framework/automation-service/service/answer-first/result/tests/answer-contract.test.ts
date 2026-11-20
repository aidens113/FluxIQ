// The answer contract: the request's named columns in its order, and whether the reader was sure of them.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstAnswerContractOf } from "../index.ts";

describe("the answer contract", () => {
  it("is the named columns in the request's order, sure", () => {
    expect(automationStudioAnswerFirstAnswerContractOf("Copy the timetable with columns train, departs and platform.")).toEqual({ columns: ["train", "departs", "platform"], sure: true, maybe: [] });
  });

  it("reads the last column before a colon that opens its explanation, sure (run-mwblz4aq, priya fix 4)", () => {
    const contract = automationStudioAnswerFirstAnswerContractOf("List every reply with columns author, comment and date: author is the username of whoever wrote it, comment is its text, and date is the day it was posted.");
    expect(contract).toEqual({ columns: ["author", "comment", "date"], sure: true, maybe: [] });
  });

  it("is unsure where the closing item runs on, naming what was read and what may be one more", () => {
    expect(automationStudioAnswerFirstAnswerContractOf("Copy the timetable with columns train and platform as the board shows it.")).toEqual({
      columns: ["train"],
      sure: false,
      maybe: ["platform as the", "platform as", "platform"],
    });
  });

  it("is sure and empty where the request names no column", () => {
    expect(automationStudioAnswerFirstAnswerContractOf("Copy the free seats.")).toEqual({ columns: [], sure: true, maybe: [] });
  });
});
