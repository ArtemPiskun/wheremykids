import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import type { MemberRole, Plan } from '../../database/types';

export interface ChildFamily {
  familyId: string;
  plan: Plan;
}

/**
 * Every resource check goes through here. IDs from the URL are never proof of access:
 * the caller's membership is always resolved from the database.
 */
@Injectable()
export class FamilyAccessService {
  constructor(@Inject(DB) private readonly db: DB) {}

  async roleIn(userId: string, familyId: string): Promise<MemberRole | null> {
    const row = await this.db
      .selectFrom('family_members')
      .select('role')
      .where('family_id', '=', familyId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  async assertMember(userId: string, familyId: string): Promise<MemberRole> {
    const role = await this.roleIn(userId, familyId);
    // 404 rather than 403 so family ids cannot be probed.
    if (!role) throw AppError.notFound('FAMILY_NOT_FOUND', 'Family not found');
    return role;
  }

  async assertParentIn(userId: string, familyId: string): Promise<MemberRole> {
    const role = await this.assertMember(userId, familyId);
    if (role === 'child') throw AppError.forbidden();
    return role;
  }

  async assertOwner(userId: string, familyId: string): Promise<void> {
    const role = await this.assertMember(userId, familyId);
    if (role !== 'owner') throw AppError.forbidden('OWNER_ONLY', 'Only the family owner can do this');
  }

  /** Resolves the child's family and checks that `parentId` is a parent there. */
  async assertParentOf(parentId: string, childId: string): Promise<ChildFamily> {
    const row = await this.db
      .selectFrom('family_members as c')
      .innerJoin('family_members as p', 'p.family_id', 'c.family_id')
      .innerJoin('families as f', 'f.id', 'c.family_id')
      .select(['c.family_id', 'f.plan'])
      .where('c.user_id', '=', childId)
      .where('c.role', '=', 'child')
      .where('p.user_id', '=', parentId)
      .where('p.role', 'in', ['owner', 'parent'])
      .executeTakeFirst();
    if (!row) throw AppError.notFound('CHILD_NOT_FOUND', 'Child not found');
    return { familyId: row.family_id, plan: row.plan };
  }

  async familyOfChild(childId: string): Promise<ChildFamily | null> {
    const row = await this.db
      .selectFrom('family_members as m')
      .innerJoin('families as f', 'f.id', 'm.family_id')
      .select(['m.family_id', 'f.plan'])
      .where('m.user_id', '=', childId)
      .where('m.role', '=', 'child')
      .executeTakeFirst();
    return row ? { familyId: row.family_id, plan: row.plan } : null;
  }

  async parentIds(familyId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('family_members')
      .select('user_id')
      .where('family_id', '=', familyId)
      .where('role', 'in', ['owner', 'parent'])
      .execute();
    return rows.map((r) => r.user_id);
  }

  async parentFamilyIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('family_members')
      .select('family_id')
      .where('user_id', '=', userId)
      .where('role', 'in', ['owner', 'parent'])
      .execute();
    return rows.map((r) => r.family_id);
  }

  async childIdsVisibleTo(parentId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('family_members as p')
      .innerJoin('family_members as c', 'c.family_id', 'p.family_id')
      .select('c.user_id')
      .where('p.user_id', '=', parentId)
      .where('p.role', 'in', ['owner', 'parent'])
      .where('c.role', '=', 'child')
      .execute();
    return rows.map((r) => r.user_id);
  }
}
