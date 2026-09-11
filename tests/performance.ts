import { Ocean, simulationStep } from '../lib/ocean.ts';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

// Run each measurement sequentially on the same deterministic initial schools.
// Optional first argument points to a saved baseline engine, never modifies it.
const baseline = process.argv[2] ? (await import(pathToFileURL(process.argv[2]).href)).Ocean : null;
const measure = (Engine: typeof Ocean, population: number, name: string) => {
  let seed = 713;
  Math.random = () => { seed = (Math.imul(seed,1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  const world = new Engine(null);
  world.settings.events = false; world.settings.population = population;
  // Match physical dimensions so the comparison is not helped by a larger world.
  world.width = 2400; world.height = 1467; world.cols = Math.ceil(world.width / 70); world.rows = Math.ceil(world.height / 70);
  world.heads = new Int32Array(world.cols * world.rows);
  world.count = 0; seed = 713;
  for (let i = 0; i < world.predators.length; i++) { const p = world.predators[i]; p.x = 2400 * (0.15 + i * 0.16); p.y = 1467 * (i % 2 ? 0.18 : 0.8); }
  for (let g = 0; g < 7; g++) world.spawn(1200 + Math.cos(g / 7 * Math.PI * 2) * 500,733 + Math.sin(g / 7 * Math.PI * 2) * 320,
    Math.floor(population / 7) + (g < population % 7 ? 1 : 0),false,g,135,g % 3);
  const tick = simulationStep(population);
  for (let k = 0; k < 60; k++) world.step(tick);
  const timings = [];
  for (let k = 0; k < 360; k++) { const t = performance.now(); world.step(tick); timings.push(performance.now() - t); }
  for (let i = 0; i < world.count; i++) if (!Number.isFinite(world.x[i]) || !Number.isFinite(world.vx[i]) || world.x[i] < 0 || world.x[i] > world.width || world.y[i] < 0 || world.y[i] > world.height) throw new Error('Population became unstable');
  timings.sort((a,b) => a-b);
  return { name,population,physicsHz:Math.round(1/tick),meanMs: +(timings.reduce((a,b) => a+b,0) / timings.length).toFixed(2),p95Ms:+timings[Math.floor(timings.length * 0.95)].toFixed(2) };
};
const results = [];
if (baseline) results.push(measure(baseline,4000,'previous'));
for (const population of [4000,20000,100000]) results.push(measure(Ocean,population,'current'));
console.log(JSON.stringify({ note:'Physics only, not browser frame rate.', results },null,2));
