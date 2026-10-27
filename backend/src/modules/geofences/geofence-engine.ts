import { haversineMeters, type LatLng } from '../../common/geo';

export interface FenceShape extends LatLng {
  radiusM: number;
}

export interface FenceState {
  /** null until the first usable fix decides the side. */
  inside: boolean | null;
  outsideStreak: number;
}

export interface FixSample extends LatLng {
  accuracy: number;
}

export interface Evaluation {
  next: FenceState;
  transition: 'enter' | 'exit' | null;
}

/** A fix this precise confirms an exit on its own; vaguer fixes need a second one. */
const CONFIDENT_ACCURACY_M = 30;
const EXIT_CONFIRMATIONS = 2;

export function exitMargin(radiusM: number): number {
  return Math.max(30, 0.15 * radiusM);
}

/**
 * Hysteresis rules:
 *  - enter when the fix is inside even after giving away half its accuracy;
 *  - exit only beyond radius + margin, and confirmed by a precise fix or two in a row;
 *  - fixes vaguer than the fence itself never change state.
 */
export function evaluateFence(fence: FenceShape, state: FenceState, fix: FixSample): Evaluation {
  if (fix.accuracy > Math.max(fence.radiusM, 100)) return { next: state, transition: null };

  const distance = haversineMeters(fence, fix);
  const clearlyInside = distance + fix.accuracy * 0.5 < fence.radiusM;
  const clearlyOutside = distance - fix.accuracy * 0.5 > fence.radiusM + exitMargin(fence.radiusM);

  if (state.inside === null) {
    if (clearlyInside) return { next: { inside: true, outsideStreak: 0 }, transition: null };
    if (clearlyOutside) return { next: { inside: false, outsideStreak: 0 }, transition: null };
    return { next: state, transition: null };
  }

  if (!state.inside) {
    return clearlyInside
      ? { next: { inside: true, outsideStreak: 0 }, transition: 'enter' }
      : { next: state, transition: null };
  }

  if (!clearlyOutside) {
    return { next: { inside: true, outsideStreak: 0 }, transition: null };
  }
  const streak = state.outsideStreak + 1;
  if (fix.accuracy <= CONFIDENT_ACCURACY_M || streak >= EXIT_CONFIRMATIONS) {
    return { next: { inside: false, outsideStreak: 0 }, transition: 'exit' };
  }
  return { next: { inside: true, outsideStreak: streak }, transition: null };
}
