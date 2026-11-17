import { ChatsPage } from "../../../features/chats";
import { requirePanelScreen } from "../../product";

export default function ChatsRoute() {
  requirePanelScreen("chats");
  return <ChatsPage />;
}
