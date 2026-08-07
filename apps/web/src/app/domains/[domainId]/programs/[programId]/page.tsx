import { redirect } from "next/navigation";

export default async function DomainProgramRedirect({ params }: { params: Promise<{ domainId: string; programId: string }> }) {
  const { domainId, programId } = await params;
  redirect(`/programs/${encodeURIComponent(programId)}?domainId=${encodeURIComponent(domainId)}`);
}
