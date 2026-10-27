import { evaluateFence, exitMargin, type FenceState } from '../../src/modules/geofences/geofence-engine';

// ~1 m of latitude in degrees.
const M = 1 / 111_195;
const fence = { lat: 50.45, lng: 30.52, radiusM: 200 };
const at = (northM: number, accuracy: number) => ({ lat: fence.lat + northM * M, lng: fence.lng, accuracy });
const inside: FenceState = { inside: true, outsideStreak: 0 };
const outside: FenceState = { inside: false, outsideStreak: 0 };

describe('evaluateFence', () => {
  it('decides the initial side silently', () => {
    expect(evaluateFence(fence, { inside: null, outsideStreak: 0 }, at(10, 10))).toEqual({ next: inside, transition: null });
    expect(evaluateFence(fence, { inside: null, outsideStreak: 0 }, at(600, 10))).toEqual({ next: outside, transition: null });
  });

  it('stays undecided near the edge', () => {
    expect(evaluateFence(fence, { inside: null, outsideStreak: 0 }, at(210, 20)).next.inside).toBeNull();
  });

  it('enters only when clearly inside after discounting accuracy', () => {
    expect(evaluateFence(fence, outside, at(150, 20)).transition).toBe('enter');
    expect(evaluateFence(fence, outside, at(190, 40)).transition).toBeNull();
  });

  it('exits immediately on a precise fix beyond the margin', () => {
    const d = fence.radiusM + exitMargin(fence.radiusM) + 20;
    expect(evaluateFence(fence, inside, at(d, 10))).toEqual({ next: outside, transition: 'exit' });
  });

  it('needs two vague fixes to confirm an exit', () => {
    const first = evaluateFence(fence, inside, at(400, 60));
    expect(first).toEqual({ next: { inside: true, outsideStreak: 1 }, transition: null });
    expect(evaluateFence(fence, first.next, at(420, 60)).transition).toBe('exit');
  });

  it('resets the streak when a fix comes back inside the margin', () => {
    const first = evaluateFence(fence, inside, at(400, 60));
    expect(evaluateFence(fence, first.next, at(220, 10))).toEqual({ next: inside, transition: null });
  });

  it('ignores fixes vaguer than the fence', () => {
    expect(evaluateFence(fence, inside, at(2000, 500))).toEqual({ next: inside, transition: null });
  });

  it('does not flap on GPS jitter around the boundary', () => {
    let state = inside;
    let transitions = 0;
    for (let i = 0; i < 50; i++) {
      const res = evaluateFence(fence, state, at(fence.radiusM + (i % 2 ? 15 : -15), 25));
      state = res.next;
      if (res.transition) transitions++;
    }
    expect(transitions).toBe(0);
  });
});
