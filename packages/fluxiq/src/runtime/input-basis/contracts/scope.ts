/** Internal service authority supplies scope; requests cannot nominate their own principal. */
export type AutomationStudioInputScope = Readonly<{ projectId: string; taskId: string; principalId: string; producerId: string }>;
