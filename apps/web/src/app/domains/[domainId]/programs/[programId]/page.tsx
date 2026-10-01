import { redirect } from "next/navigation";

export default async function DomainProgramRedirect({ params, searchParams }: {
  params: Promise<{ domainId: string; programId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ domainId, programId }, query] = await Promise.all([params, searchParams]);
  const destination = new URLSearchParams({ domainId });
  for (const [key, value] of Object.entries(query)) {
    if (key === "domainId" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) destination.append(key, entry);
  }
  redirect(`/programs/${encodeURIComponent(programId)}?${destination}`);
}
