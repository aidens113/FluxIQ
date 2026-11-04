// The answer turn: what a task found, said in a person's words and drawn in the stream.
// `answerModel` is the words as data (no DOM); `createAnswerView` draws one outcome and
// keeps its element across redraws; `createAnswerReader` reads a thread's outcomes through
// the results port; `AnswerHost` is the callbacks a host supplies.
export { answerModel, hasAnswerTurn, type AnswerKind, type AnswerModel, type AnswerModelOptions } from "./model/index.ts";
export { createAnswerReader, type AnswerReader } from "./reader.ts";
export { createAnswerView, type AnswerHost, type AnswerView } from "./view/index.ts";
export { durationWords, usdWords, usingSavedFor } from "./words/index.ts";
