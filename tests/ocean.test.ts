import assert from 'node:assert/strict';
import { Ocean } from '../lib/ocean.ts';
import { performance } from 'node:perf_hooks';

// Seed the simulation so numerical and population regressions are reproducible.
let seed = 713;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
const ocean = new Ocean(null);
assert.equal(ocean.predators.filter(p => p.kind === 0).length, 2);
assert.equal(ocean.predators.filter(p => p.kind === 1).length, 3);
const original = ocean.count;
assert.equal(ocean.interact('fish', 700, 400, true), 28);
assert.equal(ocean.count, original + 28);
for (let n = 0; n < 30; n++) ocean.interact('food', 700, 400, true);
assert.equal(ocean.foods.length, 12);
ocean.interact('wave', ocean.x[0], ocean.y[0], true);
ocean.step(1 / 30);
assert(ocean.snapshot().alarm > 0, 'Scare waves must induce flight');
let catches = 0, peakSpeed = 0, maxStep = 0;
const start = performance.now();
for (let frame = 0; frame < 18000; frame++) {
  const before = ocean.count, tick = performance.now(); ocean.step(1 / 30); maxStep = Math.max(maxStep, performance.now() - tick);
  if (ocean.count < before) catches += before - ocean.count;
  for (const p of ocean.predators) if (p.kind) peakSpeed = Math.max(peakSpeed, Math.hypot(p.vx, p.vy));
  if (frame % 900 === 0) for (let i = 0; i < ocean.count; i++) {
    assert(Number.isFinite(ocean.x[i]) && Number.isFinite(ocean.vx[i]), 'State stays finite');
    assert(ocean.x[i] >= 0 && ocean.x[i] <= ocean.width && ocean.y[i] >= 0 && ocean.y[i] <= ocean.height, 'Fish stay in world');
  }
}
assert(catches > 0, 'Predators must occasionally catch fish');
assert(peakSpeed > 170, 'Barracudas must have sustained bursts');
assert(ocean.count > 900, 'Replenishment prevents collapse');
assert.equal(ocean.foods.length, 0, 'Food expires');
assert(ocean.effects.length < 10, 'Effects are reclaimed');
console.log(JSON.stringify({ simulatedMinutes: 10, fish: ocean.count, catches, peakSpeed: Math.round(peakSpeed), averageStepMs: (performance.now() - start) / 18000, maxStepMs: maxStep }));
// Dense user spawning remains bounded and can recover from any population loss.
ocean.spawn(ocean.width / 2, ocean.height / 2, 10000);
assert.equal(ocean.count, 4000); assert.equal(ocean.spawn(500, 500, 28), 0);
const denseStart = performance.now(); for (let i = 0; i < 300; i++) ocean.step(1 / 30);
console.log(JSON.stringify({ denseFish: ocean.count, averageStepMs: (performance.now() - denseStart) / 300 }));
ocean.count = 0; ocean.step(1.1); assert(ocean.count > 0, 'Empty worlds recover');
ocean.resize(390, 844); for (let i = 0; i < 120; i++) ocean.step(1 / 30);
assert(Number.isFinite(ocean.x[0]));
console.log('Ocean checks passed');
