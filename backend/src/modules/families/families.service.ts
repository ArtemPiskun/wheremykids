import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { LocationStateStore } from '../locations/location-state.store';
import { presenceStatus } from '../locations/location.types';
import { limitsFor } from '../plans/plans';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateChildDto, CreateFamilyDto, UpdateChildDto } from './families.dto';
import { FamilyAccessService } from './family-access.service';

@Injectable()
export class FamiliesService {
  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly access: FamilyAccessService,
    private readonly state: LocationStateStore,
    private readonly devices: DevicesService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateFamilyDto) {
    const id = uuidv7();
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('families').values({ id, name: dto.name, owner_id: user.userId }).execute();
      await trx.insertInto('family_members').values({ family_id: id, user_id: user.userId, role: 'owner' }).execute();
    });
    await this.realtime.joinFamilyRoom(user.userId, id);
    return this.get(user, id);
  }

  async get(user: AuthUser, familyId: string) {
    await this.access.assertParentIn(user.userId, familyId);
    const family = await this.db.selectFrom('families').selectAll().where('id', '=', familyId).executeTakeFirstOrThrow();
    const members = await this.db
      .selectFrom('family_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['u.id', 'u.display_name', 'u.avatar', 'u.birth_year', 'u.phone', 'u.sharing_paused_until', 'm.role', 'm.joined_at'])
      .where('m.family_id', '=', familyId)
      .orderBy('m.joined_at')
      .execute();

    const childIds = members.filter((m) => m.role === 'child').map((m) => m.id);
    const [presence, deviceCounts] = await Promise.all([
      this.state.getPresence(childIds),
      childIds.length
        ? this.db
            .selectFrom('devices')
            .select(['user_id', (eb) => eb.fn.countAll<string>().as('count')])
            .where('user_id', 'in', childIds)
            .where('revoked_at', 'is', null)
            .groupBy('user_id')
            .execute()
        : Promise.resolve([]),
    ]);
    const devicesByChild = new Map(deviceCounts.map((d) => [d.user_id, Number(d.count)]));
    const now = Date.now();

    return {
      id: family.id,
      name: family.name,
      plan: family.plan,
      limits: limitsFor(family.plan),
      myRole: members.find((m) => m.id === user.userId)?.role,
      parents: members
        .filter((m) => m.role !== 'child')
        .map((m) => ({ id: m.id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at })),
      children: members
        .filter((m) => m.role === 'child')
        .map((m) => {
          const p = presence.get(m.id);
          const deviceCount = devicesByChild.get(m.id) ?? 0;
          return {
            id: m.id,
            displayName: m.display_name,
            avatar: m.avatar,
            birthYear: m.birth_year,
            phone: m.phone,
            connected: deviceCount > 0,
            deviceCount,
            status: deviceCount ? presenceStatus(p?.lastSeenMs ?? null, now, m.sharing_paused_until) : 'offline',
            lastSeenAt: p?.lastSeenMs ? new Date(p.lastSeenMs).toISOString() : null,
            battery: p?.battery ?? null,
            charging: p?.charging ?? null,
            sharingPausedUntil: m.sharing_paused_until,
          };
        }),
    };
  }

  async listMine(user: AuthUser) {
    const rows = await this.db
      .selectFrom('family_members as m')
      .innerJoin('families as f', 'f.id', 'm.family_id')
      .select(['f.id', 'f.name', 'f.plan', 'm.role'])
      .where('m.user_id', '=', user.userId)
      .orderBy('m.joined_at')
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan, role: r.role }));
  }

  async addChild(user: AuthUser, familyId: string, dto: CreateChildDto, ip?: string) {
    await this.access.assertParentIn(user.userId, familyId);
    const childId = uuidv7();
    await this.db.transaction().execute(async (trx) => {
      // Lock the family row so two concurrent requests cannot both pass the plan check.
      const family = await trx.selectFrom('families').select('plan').where('id', '=', familyId).forUpdate().executeTakeFirstOrThrow();
      const { count } = await trx
        .selectFrom('family_members')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('family_id', '=', familyId)
        .where('role', '=', 'child')
        .executeTakeFirstOrThrow();
      const limit = limitsFor(family.plan).maxChildren;
      if (Number(count) >= limit) throw AppError.planLimit('Child limit reached for the current plan', { limit });

      await trx
        .insertInto('users')
        .values({
          id: childId,
          role: 'child',
          display_name: dto.displayName,
          birth_year: dto.birthYear ?? null,
          avatar: dto.avatar ?? null,
          phone: dto.phone ?? null,
        })
        .execute();
      await trx.insertInto('family_members').values({ family_id: familyId, user_id: childId, role: 'child' }).execute();
    });
    await this.audit.record({ action: 'child.created', actorUserId: user.userId, targetType: 'child', targetId: childId, ip });
    return { id: childId, displayName: dto.displayName, birthYear: dto.birthYear ?? null, avatar: dto.avatar ?? null, phone: dto.phone ?? null };
  }

  async updateChild(user: AuthUser, familyId: string, childId: string, dto: UpdateChildDto) {
    await this.assertChildInFamily(user, familyId, childId);
    const row = await this.db
      .updateTable('users')
      .set({
        ...(dto.displayName !== undefined && { display_name: dto.displayName }),
        ...(dto.birthYear !== undefined && { birth_year: dto.birthYear }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        updated_at: new Date(),
      })
      .where('id', '=', childId)
      .returning(['id', 'display_name', 'birth_year', 'avatar', 'phone'])
      .executeTakeFirstOrThrow();
    return { id: row.id, displayName: row.display_name, birthYear: row.birth_year, avatar: row.avatar, phone: row.phone };
  }

  /** Deletes the child profile with all history, devices and SOS events (cascade). */
  async deleteChild(user: AuthUser, familyId: string, childId: string, ip?: string): Promise<void> {
    await this.assertChildInFamily(user, familyId, childId);
    await this.db.transaction().execute(async (trx) => {
      await this.devices.revokeAllForUser(trx, childId);
      await trx.deleteFrom('users').where('id', '=', childId).where('role', '=', 'child').execute();
    });
    await this.state.clear(childId);
    await this.audit.record({ action: 'child.deleted', actorUserId: user.userId, targetType: 'child', targetId: childId, ip });
  }

  private async assertChildInFamily(user: AuthUser, familyId: string, childId: string): Promise<void> {
    const { familyId: actual } = await this.access.assertParentOf(user.userId, childId);
    if (actual !== familyId) throw AppError.notFound('CHILD_NOT_FOUND', 'Child not found');
  }
}
