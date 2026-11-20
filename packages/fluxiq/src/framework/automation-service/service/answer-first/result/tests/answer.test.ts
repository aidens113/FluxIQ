// The answer's rows under the contract: narrowed only where the contract is sure and every named column is held.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultVersion } from "../index.ts";
import { page, step } from "./support.ts";

const timetable: AutomationStudioAnswerFirstResultVersion = { conditions: [], fields: { Train: "train", "departs at": "departure", link: "detail address" }, listKey: "list:timetable" };
const row = { Train: "IC 12", "departs at": "8:05", link: "detail-12" };

describe("the answer's rows", () => {
  it("are narrowed to the named columns, under the request's names, where a held column differs only in case or spacing", () => {
    const port = automationStudioAnswerFirstResultPort("Copy the timetable with columns train and departs_at.");
    port.record([page(step(3), "c1", [row], { version: timetable })]);
    expect(port.answer()).toEqual({ rows: [{ train: "IC 12", departs_at: "8:05" }], columns: ["train", "departs_at"], unmatched: [] });
  });

  it("are left as read, with the named column reported, where the read holds no column of that name", () => {
    const port = automationStudioAnswerFirstResultPort("Copy the timetable with columns train and platform.");
    port.record([page(step(3), "c1", [row], { version: timetable })]);
    expect(port.answer()).toEqual({ rows: [row], columns: ["Train", "departs at", "link"], unmatched: ["platform"] });
  });

  it("are left as read where the contract is unsure", () => {
    const port = automationStudioAnswerFirstResultPort("Copy the timetable with columns train and departs at as the board shows it.");
    port.record([page(step(3), "c1", [row], { version: timetable })]);
    expect(port.answer().rows).toEqual([row]);
  });

  it("are none, with the contract's columns, where the draft has no read step", () => {
    const port = automationStudioAnswerFirstResultPort("Copy the timetable with columns train and platform.");
    expect(port.answer()).toEqual({ rows: [], columns: ["train", "platform"], unmatched: [] });
  });
});
