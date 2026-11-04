// The small DOM the chat's tests build on, for any client's tests of a mounted chat,
// and a results port with its outcomes, for building the answer turn with no Core behind it.
export { FakeElement, fake, withFakeDocument } from "./fake-dom.ts";
export * from "./results/index.ts";
export * from "./library/index.ts";
export * from "./tasks/index.ts";
