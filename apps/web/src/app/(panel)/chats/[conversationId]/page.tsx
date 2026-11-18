import { ChatThreadPage } from "../../../../features/chats";
import { requirePanelScreen } from "../../../product";

type ChatPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PanelChatPage(props: ChatPageProps) {
  requirePanelScreen("chats");
  const { conversationId } = await props.params;
  const query = await props.searchParams;
  const projectId = typeof query.project === "string" && query.project ? query.project : undefined;
  return <ChatThreadPage conversationId={conversationId} {...(projectId ? { projectId } : {})} />;
}
