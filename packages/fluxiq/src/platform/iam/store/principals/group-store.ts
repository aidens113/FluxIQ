import { assertSegment } from "../assert/index.ts";
import { removePrincipalState } from "../attachments/remove-principal-state.ts";
import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import type { IamStoredGroup } from "../records/index.ts";

/** Groups of users. A group's policies live in the attachments records. */
export class IamGroupStore {
  private readonly scope: IamStoreScope;

  constructor(scope: IamStoreScope) {
    this.scope = scope;
  }

  async create(name: string, context: IamChangeContext): Promise<IamStoredGroup> {
    assertSegment(name, "A group name");
    if ((await this.get(name)) !== null) throw new IamStoreError("already_exists", `Group ${name} already exists.`);
    const group: IamStoredGroup = { name, members: [], createdAtMs: this.scope.now() };
    await this.scope.records.put("group", name, group);
    this.scope.audit(context, "iam:CreateGroup", [this.scope.principalFrn("group", name)]);
    return group;
  }

  async get(name: string): Promise<IamStoredGroup | null> {
    return this.scope.records.get<IamStoredGroup>("group", name);
  }

  async list(): Promise<IamStoredGroup[]> {
    return this.scope.records.list<IamStoredGroup>("group");
  }

  async delete(name: string, context: IamChangeContext): Promise<void> {
    if ((await this.get(name)) === null) throw new IamStoreError("not_found", `Group ${name} does not exist.`);
    const frn = this.scope.principalFrn("group", name);
    await this.scope.records.remove("group", name);
    await removePrincipalState(this.scope, frn);
    this.scope.audit(context, "iam:DeleteGroup", [frn]);
  }

  async addUser(groupName: string, userId: string, context: IamChangeContext): Promise<void> {
    assertSegment(userId, "A user id");
    const group = await this.require(groupName);
    if (group.members.includes(userId)) throw new IamStoreError("already_member", `${userId} is already in group ${groupName}.`);
    await this.scope.records.put("group", groupName, { ...group, members: [...group.members, userId] });
    this.scope.audit(context, "iam:AddUserToGroup", [this.scope.principalFrn("group", groupName), this.scope.principalFrn("user", userId)]);
  }

  async removeUser(groupName: string, userId: string, context: IamChangeContext): Promise<void> {
    const group = await this.require(groupName);
    if (!group.members.includes(userId)) throw new IamStoreError("not_member", `${userId} is not in group ${groupName}.`);
    await this.scope.records.put("group", groupName, { ...group, members: group.members.filter((member) => member !== userId) });
    this.scope.audit(context, "iam:RemoveUserFromGroup", [this.scope.principalFrn("group", groupName), this.scope.principalFrn("user", userId)]);
  }

  private async require(name: string): Promise<IamStoredGroup> {
    const group = await this.get(name);
    if (group === null) throw new IamStoreError("not_found", `Group ${name} does not exist.`);
    return group;
  }
}
