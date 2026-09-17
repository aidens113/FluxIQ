// A task's branch name, and reading one back. The slug is validated rather than
// trusted, because it becomes a git ref: a slug with a slash nests a ref under
// the task's own namespace, `..` is not a legal ref component at all, a space
// needs quoting in every command that carries the name afterwards, and mixed
// case collides with itself on a file system that stores refs as files without
// regard to case. Refusing here is cheaper than discovering any of it halfway
// through a checkout.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const BRANCH = /^task\/(t\d+)-(.+)$/u;

export function taskBranchName(id, slug) {
  if (!SLUG.test(slug)) {
    throw new Error(`"${slug}" is not a usable task slug: use lower-case words joined by single hyphens, for example "automation-studio-cleanup". It becomes a git ref.`);
  }
  return `task/${id}-${slug}`;
}

export function parseTaskBranch(branch) {
  const match = BRANCH.exec(branch.trim());
  return match ? { id: match[1], slug: match[2] } : null;
}
