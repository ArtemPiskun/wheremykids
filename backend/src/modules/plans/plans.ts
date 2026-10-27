import type { Plan } from '../../database/types';

export interface PlanLimits {
  maxChildren: number;
  maxParents: number;
  maxGeofences: number;
  historyDays: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxChildren: 1, maxParents: 2, maxGeofences: 1, historyDays: 1 },
  premium: { maxChildren: 3, maxParents: 2, maxGeofences: 50, historyDays: 30 },
  family: { maxChildren: 6, maxParents: 4, maxGeofences: 100, historyDays: 30 },
};

/** Hard ceiling regardless of plan; whole partitions older than this are dropped. */
export const MAX_HISTORY_DAYS = 35;
export const SOS_RETENTION_DAYS = 90;
export const AUDIT_RETENTION_DAYS = 365;

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
