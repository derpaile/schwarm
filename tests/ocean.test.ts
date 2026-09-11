import assert from 'node:assert/strict';
import { Ocean, MAX_FISH } from '../lib/ocean.ts';
import { FISH_SPECIES, PREDATOR_SPECIES, MAX_PREDATORS } from '../lib/species.ts';
import { performance } from 'node:perf_hooks';

// Seed the simulation so numerical and population regressions are reproducible.
let seed = 713;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
const ocean = new Ocean(null);
ocean.settings.population = 1200; ocean.settings.brush = 28; ocean.settings.events = false; ocean.reset();
assert.equal(ocean.predators.filter(p => p.kind === 0).length, 2);
assert.equal(ocean.predators.filter(p => p.kind === 1).length, 3);
assert.equal(ocean.predators.filter(p => p.kind === 2).length, 1);
assert.equal(ocean.predators.filter(p => p.kind === 3).length, 2);
assert(ocean.snapshot().fishCounts.every(n => n > 0), 'Initial world contains all fish species');
// Camera transforms preserve the world point under the pointer while zooming.
const anchor = ocean.screenToWorld(750, 430);
ocean.zoomAt(2, 750, 430);
const anchored = ocean.screenToWorld(750, 430);
assert(Math.hypot(anchor.x - anchored.x, anchor.y - anchored.y) < 0.0001);
ocean.followNext(); ocean.updateCamera(1);
assert.equal(ocean.snapshot().focus, 'Hai 01');
ocean.pan(50, 10); assert.equal(ocean.following, -1);
ocean.zoomAt(100); assert.equal(ocean.camera.zoom, 3.5);
ocean.resetCamera(); assert.equal(ocean.camera.zoom, 1);
const original = ocean.count;
assert.equal(ocean.interact('fish', 700, 400, true), 28);
assert.equal(ocean.count, original + 28);
assert.equal(ocean.maturity[original], 0, 'New fish start as juveniles');
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
    assert(ocean.species[i] < FISH_SPECIES.length, 'Species survive population compaction');
    assert(ocean.energy[i] >= 0 && ocean.energy[i] <= 1 && ocean.maturity[i] >= 0 && ocean.maturity[i] <= 1);
    assert(Number.isFinite(ocean.x[i]) && Number.isFinite(ocean.vx[i]), 'State stays finite');
    assert(ocean.x[i] >= 0 && ocean.x[i] <= ocean.width && ocean.y[i] >= 0 && ocean.y[i] <= ocean.height, 'Fish stay in world');
  }
}
assert(ocean.maturity[0] > 0.99, 'Juveniles grow into adults');
assert(catches > 0, 'Predators must occasionally catch fish');
assert(peakSpeed > 170, 'Barracudas must have sustained bursts');
assert(ocean.count > 900, 'Replenishment prevents collapse');
assert.equal(ocean.foods.length, 0, 'Food expires');
assert(ocean.effects.length < 10, 'Effects are reclaimed');
console.log(JSON.stringify({ simulatedMinutes: 10, fish: ocean.count, catches, peakSpeed: Math.round(peakSpeed), averageStepMs: (performance.now() - start) / 18000, maxStepMs: maxStep }));
// Dense user spawning remains bounded and can recover from any population loss.
ocean.spawn(ocean.width / 2, ocean.height / 2, MAX_FISH * 2);
assert.equal(ocean.count, MAX_FISH); assert.equal(ocean.spawn(500, 500, 28), 0);
const denseStart = performance.now(); for (let i = 0; i < 300; i++) ocean.step(1 / 30);
console.log(JSON.stringify({ denseFish: ocean.count, averageStepMs: (performance.now() - denseStart) / 300 }));
ocean.count = 0; ocean.step(1.1); assert(ocean.count > 0, 'Empty worlds recover');
ocean.resize(390, 844); for (let i = 0; i < 120; i++) ocean.step(1 / 30);
assert(Number.isFinite(ocean.x[0]));
ocean.settings.predators = false; ocean.updateCamera(1); assert.equal(ocean.snapshot().focus, null);
// New sandbox actions are bounded, reversible, and affect real simulation state.
const world = new Ocean(null); world.settings.events = false;
world.count = 0; world.spawn(world.width / 2,world.height / 2,100,false,0,18);
for (const p of world.predators) { p.x = world.width / 2; p.y = world.height / 2; p.rest = 0; }
world.interact('refuge',world.width / 2,world.height / 2,true);
for (let k = 0; k < 15; k++) world.step(1 / 30);
assert.equal(world.captures,0,'Refuges prevent captures even with predators inside');
assert.equal(world.snapshot().alarm,0,'Protected fish recover instead of fleeing nearby predators');
assert.equal(world.interact('erase',world.width / 2,world.height / 2,true),1);
assert.equal(world.refuges.length,0);
world.step(1 / 30); assert(world.snapshot().alarm > 0,'Removing protection restores predator response');
world.interact('vortex',world.width / 2,world.height / 2,true);
const spin = world.vortices[0].spin;
world.interact('vortex',world.width / 2,world.height / 2,true);
assert.equal(world.vortices.length,1); assert.equal(world.vortices[0].spin,-spin);
world.vortices[0].life = 0.01; world.step(1 / 30); assert.equal(world.vortices.length,0);
for (let i = 0; i < 20; i++) world.interact('refuge',50 + i * 100,world.height / 2,true);
assert.equal(world.refuges.length,6);
world.settings.events = true;
for (let k = 0; k < 25; k++) { world.time += 100; world.step(1 / 30); }
assert(world.foods.length <= 12 && world.vortices.length <= 6 && world.count <= MAX_FISH);
world.setAutomatic(true); world.updateCamera(0.1); assert(world.following >= 0);
world.pan(1,1); assert.equal(world.automatic,false,'Manual pan cancels automatic camera');
for (const preset of ['calm','migration','hunt'] as const) {
  world.applyScenario(preset); assert.equal(world.count,world.settings.population);
  for (let k = 0; k < 30; k++) world.step(1 / 30);
  assert(Number.isFinite(world.x[world.count - 1]));
}
const community = new Ocean(null); community.settings.events = false; community.settings.predators = false; community.settings.population = 0; community.settings.current = 0; community.count = 0;
for (let kind = 0; kind < FISH_SPECIES.length; kind++) community.spawn(300 + kind * 600,700,1,false,0,0,kind);
for (let frame = 0; frame < 90; frame++) community.step(1 / 30);
assert.deepEqual(community.snapshot().fishCounts,[1,1,1]);
assert(community.swim[2] > community.swim[0] * 1.3,'Mackerel have a higher cruising speed');
assert(community.size[1] < community.size[2],'Anchovies and mackerel differ in size');
community.count = 0; community.spawn(500,500,1,false,0,0,2); community.settings.population = 10; community.births = 1.01; community.step(1 / 30);
assert.equal(community.species[1],2,'Offspring inherit their parent species');
assert.throws(() => community.spawn(500,500,1,false,0,0,99),/species/);
community.settings.predators = true;
for (let kind = 0; kind < PREDATOR_SPECIES.length; kind++) {
  const before = community.snapshot().predatorCounts[kind];
  assert.equal(community.interact('predator',500,500,true,kind),1);
  assert.equal(community.snapshot().predatorCounts[kind],before+1);
}
for (let k = 0; k < 20; k++) community.addPredator(2,400,400);
assert.equal(community.predators.length,MAX_PREDATORS);
assert.equal(community.addPredator(0,400,400),0);
assert.equal(community.snapshot().predatorCounts.reduce((a,b) => a+b,0),MAX_PREDATORS);
community.settings.predators = false; assert.equal(community.snapshot().predatorCounts.reduce((a,b) => a+b,0),0);
console.log('Ocean, species, camera, events and scenario checks passed');
