import { describe, expect, it } from 'vitest';
import { Composer } from './composer';
import { boxFromLandmarks } from './crop';
import { ProbabilitySmoother } from './smoother';

const classes = ['A', 'B', 'nothing'];
const scores = (a: number, b: number, n = 0) => Float32Array.from([a, b, n]);

describe('ProbabilitySmoother', () => {
  const make = () => new ProbabilitySmoother(classes, { window: 7, required: 5, threshold: 0.75 });

  it('needs enough agreeing frames before a letter is stable', () => {
    const s = make();
    for (let i = 0; i < 4; i++) expect(s.update(scores(0.95, 0.05)).stable).toBeNull();
    expect(s.update(scores(0.95, 0.05)).stable).toBe('A');
  });

  it('tolerates one misread frame inside the window', () => {
    const s = make();
    for (let i = 0; i < 5; i++) s.update(scores(0.95, 0.05));
    expect(s.update(scores(0.2, 0.8)).stable).toBe('A');
  });

  it('rejects a winner whose mean score is below threshold', () => {
    const s = make();
    let last;
    for (let i = 0; i < 7; i++) last = s.update(i % 3 === 0 ? scores(0.1, 0.9) : scores(0.8, 0.2));
    expect(last!.ranked[0].label).toBe('A');
    expect(last!.stable).toBeNull();
  });

  it('clears on a missing hand or a nothing frame', () => {
    const s = make();
    for (let i = 0; i < 6; i++) s.update(scores(0.95, 0.05));
    expect(s.update(scores(0, 0, 1)).stable).toBeNull();
    expect(s.update(scores(0.95, 0.05)).frames).toBe(1);
    s.update(null);
    expect(s.update(scores(0.95, 0.05)).stable).toBeNull();
  });
});

describe('Composer', () => {
  const make = () => new Composer({ holdMs: 500, autoSpace: true, spaceAfterMs: 1000 });

  it('types a letter once after the hold time', () => {
    const c = make();
    expect(c.update('A', true, 0).committed).toBeNull();
    expect(c.update('A', true, 300).progress).toBeCloseTo(0.6);
    expect(c.update('A', true, 500).committed).toBe('A');
    expect(c.update('A', true, 2000).committed).toBeNull();
    expect(c.text).toBe('A');
  });

  it('needs a release between double letters', () => {
    const c = make();
    c.update('L', true, 0);
    c.update('L', true, 600);
    c.update(null, true, 700);
    c.update('L', true, 800);
    c.update('L', true, 1400);
    expect(c.text).toBe('LL');
  });

  it('adds one space after the hand has been gone long enough', () => {
    const c = make();
    c.update('A', true, 0);
    c.update('A', true, 600);
    c.update(null, false, 1000);
    expect(c.text).toBe('A');
    expect(c.update(null, false, 1700).committed).toBe(' ');
    c.update(null, false, 5000);
    expect(c.text).toBe('A ');
  });
});

describe('boxFromLandmarks', () => {
  it('matches webcam.py: square, centred, 20% margin per side', () => {
    const box = boxFromLandmarks([{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.6 }], 400, 200, 0.2);
    expect(box).toEqual({ cx: 150, cy: 110, side: 140 });
  });
});
