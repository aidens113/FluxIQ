// The confirmation before a task is deleted: what goes and what stays, said plainly.

export type DeleteWords = { question: string; goes: string; stays: string };

/** The words asked of a person before `title` is deleted. */
export function deleteWords(title: string): DeleteWords {
  return {
    question: `Delete “${title}”?`,
    goes: "This removes the task from your list, with its attempts and the steps shown for them.",
    stays: "Any automation or subflow it saved stays, and so does anything it did on the site. Nothing it did there is undone."
  };
}
