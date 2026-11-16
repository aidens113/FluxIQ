// The Chats place: the conversations with FluxIQ, listed across projects, each opening as a full page.
// Only the client pages are exported. Server routes import this barrel, and a
// plain helper here (`load-chats.ts` reaches the automation-studio conversation
// barrel) would pull client-only modules into their server graph; the pages
// import their helpers by file.
export { ChatThreadPage } from "./ChatThreadPage";
export { ChatsPage } from "./ChatsPage";
