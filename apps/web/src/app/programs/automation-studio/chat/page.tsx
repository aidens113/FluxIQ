import Link from "next/link";
import { currentFluxIQUser } from "../../../../lib/auth";
import { ChatWidgetPage } from "../../../../features/chat-widget";
import { LoginPanel } from "../../../AuthShell";

type ChatPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** FluxIQ's chat alone, for the project in `?projectId=`. Signed-out visitors log in first, as the Studio asks. */
export default async function AutomationStudioChatPage(context: ChatPageProps) {
  if (!await currentFluxIQUser()) return <LoginPanel />;
  const { projectId } = await context.searchParams;
  if (typeof projectId !== "string" || !projectId.trim()) {
    return <main><p>Say which project to chat about: open this page with <code>?projectId=</code>.</p><Link href="/programs/automation-studio">Open the Studio</Link></main>;
  }
  return <ChatWidgetPage projectId={projectId.trim()} />;
}
