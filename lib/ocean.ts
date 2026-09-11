import { FISH_SPECIES, PREDATOR_SPECIES, MAX_PREDATORS } from './species.ts';
import { FishRenderer } from './fish-renderer.ts';
export type Tool = 'fish' | 'food' | 'wave' | 'vortex' | 'refuge' | 'erase' | 'predator';
export type Scenario = 'calm' | 'migration' | 'hunt';
export const MAX_FISH = 100000;
export const simulationStep = (count: number) => count > 60000 ? 1 / 15 : count > 30000 ? 1 / 20 : 1 / 30;
export const DEFAULT_SETTINGS: Settings = { speed: 1, population: 6000, cohesion: 1, predators: true, trails: true, current: 0.45, events: true, night: false, alarmView: false, brush: 100, fishType: 0, predatorType: 0 };
export const EMPTY_SNAPSHOT: Snapshot = { count: 0, sharks: 2, barracudas: 3, alarm: 0, elapsed: 0, fps: 60, zoom: 1, focus: null, behavior: '', captures: 0, event: '', automatic: false, renderer: 'canvas', stepMs: 0, shelters: 0, vortices: 0, fishCounts: [0,0,0], predatorCounts: [2,3,1,2] };
type Zone = { x: number; y: number; radius: number; life: number; spin: number };
export type Settings = { speed: number; population: number; cohesion: number; predators: boolean; trails: boolean; current: number; events: boolean; night: boolean; alarmView: boolean; brush: number; fishType: number; predatorType: number };
export type Snapshot = { count: number; sharks: number; barracudas: number; alarm: number; elapsed: number; fps: number; zoom: number; focus: string | null; behavior: string; captures: number; event: string; automatic: boolean; renderer: 'gpu' | 'canvas'; stepMs: number; shelters: number; vortices: number; fishCounts: number[]; predatorCounts: number[] };
type Predator = { x: number; y: number; vx: number; vy: number; angle: number; kind: number; phase: number; timer: number; target: number; rest: number; burst: number; identity: number; ordinal: number; huntTime: number; trail: number[] };
type Effect = { x: number; y: number; age: number; kind: Tool | 'catch' };
const TAU = Math.PI * 2;
const MAX = MAX_FISH;
const CELL = 70;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const turn = (from: number, to: number, limit: number) => from + clamp(Math.atan2(Math.sin(to - from), Math.cos(to - from)), -limit, limit);

/** Fixed-step local-neighbor simulation. Rendering never drives the simulation clock. */
export class Ocean {
  species = new Uint8Array(MAX);
  x = new Float32Array(MAX); y = new Float32Array(MAX);
  vx = new Float32Array(MAX); vy = new Float32Array(MAX);
  nx = new Float32Array(MAX); ny = new Float32Array(MAX);
  fear = new Float32Array(MAX); nextFear = new Float32Array(MAX);
  phase = new Float32Array(MAX); size = new Float32Array(MAX); social = new Uint8Array(MAX);
  energy = new Float32Array(MAX); maturity = new Float32Array(MAX);
  swim = new Float32Array(MAX); dx = new Float32Array(MAX); dy = new Float32Array(MAX);
  next = new Int32Array(MAX); heads = new Int32Array(1);
  count = 0; width = 1800; height = 1100; cols = 1; rows = 1;
  time = 0; births = 0; predators: Predator[] = []; effects: Effect[] = [];
  foods: { x: number; y: number; life: number }[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  paused = false;
  camera = { x: 900, y: 550, zoom: 1 }; following = -1; captures = 0;
  private viewWidth = 1440; private viewHeight = 880;
  private gridTick = 0;
  private ordered = new Int32Array(MAX); private cellCounts = new Int32Array(1); private offsets = new Int32Array(2); private cursors = new Int32Array(1);
  private phaseSin = new Float32Array(MAX); private phaseCos = new Float32Array(MAX);
  private flowX = new Float32Array(1); private flowY = new Float32Array(1);
  private cosTurn = new Float32Array(9); private sinTurn = new Float32Array(9);
  private renderer: FishRenderer | null = null; private gpuActive = false;
  simulationMs = 0; automatic = false; private cameraTimer = 0;
  vortices: Zone[] = []; refuges: Zone[] = [];
  event = ''; private eventUntil = 0; private nextEvent = 30;
  private ctx: CanvasRenderingContext2D | null;
  private canvas: HTMLCanvasElement | null;
  private scale = 1; private pixelRatio = 1;
  private particles = Array.from({ length: 95 }, () => [Math.random(), Math.random(), Math.random()]);

  constructor(canvas: HTMLCanvasElement | null, fishCanvas?: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: true }) ?? null;
    if (fishCanvas) this.renderer = FishRenderer.create(fishCanvas, MAX);
    this.resize(1440, 880);
    this.reset();
  }
  resize(w: number, h: number) {
    const oldW = this.width, oldH = this.height;
    this.viewWidth = w; this.viewHeight = h;
    this.scale = Math.min(w / 2400, h / 1360);
    this.width = w / this.scale; this.height = h / this.scale;
    for (let i = 0; i < this.count; i++) { this.x[i] *= this.width / oldW; this.y[i] *= this.height / oldH; }
    for (const p of this.predators) { p.x *= this.width / oldW; p.y *= this.height / oldH; p.trail.length = 0; }
    for (const item of [...this.foods, ...this.effects, ...this.vortices, ...this.refuges]) { item.x *= this.width / oldW; item.y *= this.height / oldH; }
    this.camera.x *= this.width / oldW; this.camera.y *= this.height / oldH;
    this.constrainCamera();
    this.cols = Math.ceil(this.width / CELL); this.rows = Math.ceil(this.height / CELL);
    this.flowX = new Float32Array(this.rows); this.flowY = new Float32Array(this.cols);
    const cells = this.cols * this.rows;
    this.heads = new Int32Array(cells); this.cellCounts = new Int32Array(cells); this.offsets = new Int32Array(cells + 1); this.cursors = new Int32Array(cells);
    if (this.canvas) {
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(w * this.pixelRatio); this.canvas.height = Math.round(h * this.pixelRatio);
    }
  }
  reset() {
    this.count = 0; this.captures = 0; this.resetCamera(); this.time = 0; this.births = 0; this.effects = []; this.foods = []; this.vortices = []; this.refuges = []; this.nextEvent = 30; this.event = ''; this.eventUntil = 0;
    const groups = Math.max(7, Math.ceil(this.settings.population / 550));
    for (let g = 0; g < groups; g++) {
      const a = g / groups * TAU;
      const cx = this.width * (0.5 + Math.cos(a) * 0.27 + Math.sin(g * 2.3) * 0.10), cy = this.height * (0.5 + Math.sin(a) * 0.25 + Math.cos(g * 3.1) * 0.10);
      this.spawn(cx, cy, Math.floor(this.settings.population / groups) + (g < this.settings.population % groups ? 1 : 0), false, a + Math.PI / 2, 135, [0,0,0,1,2][g % 5]);
    }
    this.maturity.fill(1, 0, this.count);
    this.predators = [];
    for (const [i,kind] of [0,0,1,1,1,2,3,3].entries()) this.addPredator(kind,this.width * (0.12 + i * 0.105),this.height * (i % 2 ? 0.18 : 0.8));
  }
  addPredator(kind: number, x: number, y: number) {
    if (!Number.isInteger(kind) || !PREDATOR_SPECIES[kind]) throw new Error('Unknown predator species');
    if (this.predators.length >= MAX_PREDATORS) return 0;
    const i = this.predators.length, angle = i * 1.3, speed = PREDATOR_SPECIES[kind].cruise;
    this.predators.push({ x: clamp(x,20,this.width-20), y: clamp(y,20,this.height-20), vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      angle, kind, phase: 0, timer: 3+i, target: -1, rest: 3+i, burst: 0, identity: i,
      ordinal: this.predators.filter(p => p.kind === kind).length + 1, huntTime: 0, trail: [] });
    return 1;
  }
  spawn(x: number, y: number, amount = 28, effect = true, heading = Math.random() * TAU, spread = 32, species = this.settings.fishType) {
    if (!Number.isInteger(species) || !FISH_SPECIES[species]) throw new Error('Unknown fish species');
    const before = this.count;
    for (let k = 0; k < amount && this.count < MAX; k++) {
      const i = this.count++; this.species[i] = species;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread;
      this.x[i] = clamp(x + Math.cos(a) * r, 12, this.width - 12);
      this.y[i] = clamp(y + Math.sin(a) * r * 0.65, 12, this.height - 12);
      const dir = heading + (Math.random() - 0.5) * 0.8;
      this.vx[i] = Math.cos(dir) * 45; this.vy[i] = Math.sin(dir) * 45;
      this.phase[i] = Math.random() * TAU; this.phaseSin[i] = Math.sin(this.phase[i]); this.phaseCos[i] = Math.cos(this.phase[i]); this.size[i] = (0.7 + Math.random() * 0.6) * FISH_SPECIES[species].scale;
      this.fear[i] = 0; this.social[i] = 0; this.energy[i] = 1; this.maturity[i] = 0;
      this.swim[i] = 45; this.dx[i] = Math.cos(dir); this.dy[i] = Math.sin(dir);
    }
    if (effect && this.count > before) { if (this.effects.length >= 40) this.effects.shift(); this.effects.push({ x, y, age: 0, kind: 'fish' }); }
    return this.count - before;
  }
  interact(tool: Tool, x: number, y: number, world = false, species?: number) {
    if (!world) { const point = this.screenToWorld(x, y); x = point.x; y = point.y; }
    x = clamp(x, 10, this.width - 10); y = clamp(y, 10, this.height - 10);
    if (tool === 'predator') return this.settings.predators ? this.addPredator(species ?? this.settings.predatorType,x,y) : 0;
    if (tool === 'fish') return this.spawn(x, y, this.settings.brush, true, Math.random() * TAU, Math.max(32, Math.sqrt(this.settings.brush) * 5),species ?? this.settings.fishType);
    if (tool === 'vortex' || tool === 'refuge') {
      const list = tool === 'vortex' ? this.vortices : this.refuges;
      const existing = list.find(z => (z.x - x) ** 2 + (z.y - y) ** 2 < 45 ** 2);
      if (existing) { existing.spin *= -1; existing.life = 65; }
      else { if (list.length >= 6) list.shift(); list.push({ x, y, radius: tool === 'vortex' ? 230 : 100, life: 65, spin: list.length % 2 ? -1 : 1 }); }
    }
    if (tool === 'erase') {
      let nearest: { list: { x: number; y: number; life: number }[]; index: number } | null = null, best = 140 ** 2;
      for (const list of [this.vortices, this.refuges, this.foods]) for (let i = 0; i < list.length; i++) {
        const d = (list[i].x - x) ** 2 + (list[i].y - y) ** 2; if (d < best) { best = d; nearest = { list, index: i }; }
      }
      if (nearest) nearest.list.splice(nearest.index, 1);
      return nearest ? 1 : 0;
    }
    if (tool === 'food') { if (this.foods.length >= 12) this.foods.shift(); this.foods.push({ x, y, life: 25 }); }
    if (this.effects.length >= 40) this.effects.shift();
    this.effects.push({ x, y, age: 0, kind: tool });
    return 0;
  }
  screenToWorld(x: number, y: number) {
    const scale = this.scale * this.camera.zoom;
    return { x: this.camera.x + (x - this.viewWidth / 2) / scale, y: this.camera.y + (y - this.viewHeight / 2) / scale };
  }
  zoomAt(factor: number, x = this.viewWidth / 2, y = this.viewHeight / 2) {
    const before = this.screenToWorld(x, y);
    this.camera.zoom = clamp(this.camera.zoom * factor, 1, 3.5);
    const after = this.screenToWorld(x, y);
    this.camera.x += before.x - after.x; this.camera.y += before.y - after.y;
    this.constrainCamera();
  }
  pan(x: number, y: number) {
    this.following = -1; this.automatic = false;
    this.camera.x -= x / (this.scale * this.camera.zoom); this.camera.y -= y / (this.scale * this.camera.zoom);
    this.constrainCamera();
  }
  resetCamera() { this.automatic = false; this.following = -1; this.camera = { x: this.width / 2, y: this.height / 2, zoom: 1 }; }
  followNext() {
    this.automatic = false;
    if (!this.settings.predators) return;
    this.following = (this.following + 1) % this.predators.length;
    this.camera.zoom = Math.max(1.8, this.camera.zoom);
  }
  setAutomatic(value: boolean) { this.automatic = value; this.cameraTimer = 0; if (!value) this.following = -1; }
  updateCamera(dt: number) {
    if (this.automatic) {
      this.cameraTimer -= dt;
      if (this.cameraTimer <= 0) {
        this.cameraTimer = 16;
        if (this.settings.predators) {
          let candidate = (this.following + 1) % this.predators.length;
          for (let i = 0; i < this.predators.length; i++) if (this.predators[i].phase === 2) candidate = i;
          this.following = candidate;
        } else this.following = -1;
        this.camera.zoom = 1.5;
      }
      if (!this.settings.predators) {
        const f = 1 - Math.exp(-dt * 0.4);
        this.camera.x += (this.width * (0.5 + Math.sin(this.time * 0.02) * 0.22) - this.camera.x) * f;
        this.camera.y += (this.height * (0.5 + Math.cos(this.time * 0.025) * 0.20) - this.camera.y) * f;
      }
    }
    if (!this.settings.predators) this.following = -1;
    const p = this.predators[this.following];
    if (p) { const f = 1 - Math.exp(-dt * 2.5); this.camera.x += (p.x + p.vx * 0.45 - this.camera.x) * f; this.camera.y += (p.y + p.vy * 0.45 - this.camera.y) * f; }
    this.constrainCamera();
  }
  private constrainCamera() {
    const halfW = this.width / this.camera.zoom / 2, halfH = this.height / this.camera.zoom / 2;
    this.camera.x = clamp(this.camera.x, halfW * 0.5, this.width - halfW * 0.5); this.camera.y = clamp(this.camera.y, halfH * 0.5, this.height - halfH * 0.5);
  }
  private removeFish(i: number) {
    const last = --this.count;
    for (const field of [this.species, this.x, this.y, this.vx, this.vy, this.fear, this.phase, this.size, this.social, this.energy, this.maturity, this.swim, this.dx, this.dy, this.phaseSin, this.phaseCos]) field[i] = field[last];
    // Preserve the identity of tracked prey when compacting the population.
    for (const p of this.predators) { if (p.target === i) p.target = -1; else if (p.target === last) p.target = i; }
  }
  /** Counting-sort buckets: contiguous memory and a rotating sample per cell. */
  private grid() {
    this.cellCounts.fill(0); this.heads.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const cell = Math.min(this.cols - 1, (this.x[i] / CELL) | 0) + Math.min(this.rows - 1, (this.y[i] / CELL) | 0) * this.cols;
      this.next[i] = cell; this.cellCounts[cell]++;
    }
    this.offsets[0] = 0;
    for (let c = 0; c < this.cellCounts.length; c++) { this.offsets[c + 1] = this.offsets[c] + this.cellCounts[c]; this.cursors[c] = this.offsets[c]; }
    for (let i = 0; i < this.count; i++) this.ordered[this.cursors[this.next[i]]++] = i;
    for (let c = 0; c < this.cellCounts.length; c++) if (this.cellCounts[c]) this.heads[c] = this.ordered[this.offsets[c] + this.gridTick % this.cellCounts[c]];
    this.gridTick++;
  }
  applyScenario(scenario: Scenario) {
    const presets = { calm: { population: 4000, predators: false, current: 0.3 }, migration: { population: 12000, predators: true, current: 0.8 }, hunt: { population: 8000, predators: true, current: 0.45 } };
    this.settings = { ...this.settings, ...presets[scenario] }; this.reset();
    if (scenario === 'calm') {
      this.interact('refuge',this.width * 0.35,this.height * 0.5,true); this.interact('refuge',this.width * 0.65,this.height * 0.5,true);
    }
    if (scenario === 'migration') this.interact('vortex',this.width * 0.5,this.height * 0.5,true);
    if (scenario === 'hunt') for (const p of this.predators) p.rest = 0;
  }
  private naturalEvent() {
    const kind = Math.floor(Math.random() * 3), x = this.width * (0.15 + Math.random() * 0.7), y = this.height * (0.2 + Math.random() * 0.6);
    if (kind === 0) {
      for (let k = 0; k < 3; k++) { if (this.foods.length >= 12) this.foods.shift(); this.foods.push({ x: x + Math.cos(k * 2.1) * 75, y: y + Math.sin(k * 2.1) * 75, life: 40 }); }
      this.event = 'Planktonblüte · das Wasser wird zur Futterstelle';
    } else if (kind === 1) {
      this.interact('vortex',x,y,true); this.event = 'Die Strömung dreht · ein Wirbel zieht auf';
    } else {
      const added = this.spawn(55,y,Math.min(250,MAX - this.count),false,0,45,Math.floor(Math.random() * FISH_SPECIES.length));
      this.event = added ? 'Ein wandernder Schwarm erreicht den Ozean' : 'Der Ozean ist voller Leben';
    }
    this.eventUntil = this.time + 14; this.nextEvent = this.time + 45 + Math.random() * 35;
  }
  dispose() { this.renderer?.dispose(); }
  step(dt: number) {
    this.time += dt;
    for (let k = 0; k <= 8; k++) { this.cosTurn[k] = Math.cos((2.4 + k / 8 * 3) * dt); this.sinTurn[k] = Math.sin((2.4 + k / 8 * 3) * dt); }
    if (this.settings.events && this.time >= this.nextEvent) this.naturalEvent();
    if (this.time > this.eventUntil) this.event = '';
    this.vortices = this.vortices.filter(z => (z.life -= dt) > 0);
    this.effects = this.effects.filter(e => (e.age += dt) < (e.kind === 'wave' ? 2.8 : 1.5));
    this.foods = this.foods.filter(f => (f.life -= dt) > 0);
    this.grid();
    const w = this.width, h = this.height, t = this.time;
    const sampleLimit = this.count > 30000 ? 2 : this.count > 10000 ? 3 : this.count > 5000 ? 4 : 6;
    const wanderSin = Math.sin(t * 0.7) * 10, wanderCos = Math.cos(t * 0.7) * 10;
    for (let r = 0; r < this.rows; r++) this.flowX[r] = Math.cos((r + 0.5) * CELL * 0.003 + t * 0.055) * this.settings.current * 18;
    for (let col = 0; col < this.cols; col++) this.flowY[col] = Math.sin((col + 0.5) * CELL * 0.003 - t * 0.045) * this.settings.current * 18;
    for (let i = 0; i < this.count; i++) {
      const x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i], fishType = this.species[i], traits = FISH_SPECIES[fishType];
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, neighbors = 0, nearby = 0, alarm = 0;
      const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
      for (let r = Math.max(0, row - 1); r <= Math.min(this.rows - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(this.cols - 1, col + 1); c++) {
          const cell = r * this.cols + c, population = this.cellCounts[cell], samples = Math.min(population, sampleLimit), start = this.offsets[cell];
          const stride = population / (samples || 1), rotation = (i * 7 + this.gridTick * 3) % (population || 1);
          for (let sample = 0; sample < samples; sample++) {
            const j = this.ordered[start + ((Math.floor(sample * stride) + rotation) % population)];
            if (j === i) continue;
            const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
            if (d2 < 65 * 65 && d2 > 0.01) {
              if (d2 < 17 * 17) { const density = Math.min(3, stride); sx -= dx / (d2 + 4) * density; sy -= dy / (d2 + 4) * density; }
              const dot = dx * vx + dy * vy;
              if (dot >= 0 || dot * dot < d2 * 625 || d2 < 24 * 24) {
                const affinity = this.species[j] === fishType ? 1 : 0.12;
                ax += this.vx[j] * affinity; ay += this.vy[j] * affinity; cx += dx * affinity; cy += dy * affinity; neighbors += affinity; nearby++;
                if (d2 < 43 * 43) alarm = Math.max(alarm, this.fear[j] * 0.965);
              }
            }
          }
        }
      }
      this.social[i] = Math.min(255, Math.round(nearby * 6 / sampleLimit));
      const alignment = (1.8 + this.fear[i] * 1.4) * traits.alignment;
      const gathering = this.settings.cohesion * traits.cohesion * (1 - this.fear[i] * 0.6);
      let fx = sx * 1100, fy = sy * 1100;
      if (neighbors) {
        fx += (ax / neighbors - vx) * alignment + cx / neighbors * gathering;
        fy += (ay / neighbors - vy) * alignment + cy / neighbors * gathering;
      } else {
        // Seek visible fish nearby, never an arbitrary fish across the entire ocean.
        let nearest = -1, distance = 240 * 240;
        for (let r = Math.max(0, row - 3); r <= Math.min(this.rows - 1, row + 3); r++) {
          for (let c = Math.max(0, col - 3); c <= Math.min(this.cols - 1, col + 3); c++) {
            const j = this.heads[r * this.cols + c];
            if (j < 0 || j === i) continue;
            const d2 = ((this.x[j] - x) ** 2 + (this.y[j] - y) ** 2) * (this.species[j] === fishType ? 1 : 2);
            if (d2 < distance) { distance = d2; nearest = j; }
          }
        }
        if (nearest >= 0) { const d = Math.sqrt(distance) || 1; fx += (this.x[nearest] - x) / d * 32; fy += (this.y[nearest] - y) / d * 32; }
      }
      let direct = 0, protectedFish = false;
      for (const zone of this.refuges) {
        const zx = zone.x - x, zy = zone.y - y, d2 = zx * zx + zy * zy;
        if (d2 < zone.radius * zone.radius) protectedFish = true;
        if (this.fear[i] > 0.2 && d2 < 360 * 360) { const d = Math.sqrt(d2) || 1; fx += zx / d * 38; fy += zy / d * 38; }
      }
      for (const zone of this.vortices) {
        const zx = x - zone.x, zy = y - zone.y, d2 = zx * zx + zy * zy;
        if (d2 < zone.radius * zone.radius) {
          const d = Math.sqrt(d2) || 1, strength = (1 - d / zone.radius) * Math.min(1,zone.life / 8) * 150;
          fx += (-zy * zone.spin + zx * 0.18) / d * strength; fy += (zx * zone.spin + zy * 0.18) / d * strength;
        }
      }
      if (this.settings.predators && !protectedFish) for (const p of this.predators) {
        const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy;
        const radius = p.phase === 2 ? 175 : PREDATOR_SPECIES[p.kind].radius;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2);
          const force = (1 - d / radius) * 410;
          fx += dx / (d || 1) * force; fy += dy / (d || 1) * force;
          direct = Math.max(direct, 1 - d / radius * 0.55);
        }
      }
      for (const e of this.effects) if (e.kind === 'wave') {
        const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
        if (d < e.age * 230 + 30 && d > e.age * 230 - 100) {
          fx += dx / (d || 1) * 220; fy += dy / (d || 1) * 220; direct = 1;
        }
      }
      const fear = protectedFish ? Math.max(0, this.fear[i] - dt * 1.5) : Math.max(this.fear[i] - dt * 0.55, alarm - dt * 0.025, direct);
      this.nextFear[i] = fear;
      if (fear < 0.3) for (const food of this.foods) {
        const dx = food.x - x, dy = food.y - y, d2 = dx * dx + dy * dy;
        if (d2 < 410 * 410) { const d = Math.sqrt(d2); fx += dx / (d || 1) * Math.min(60, d * 1.5); fy += dy / (d || 1) * Math.min(60, d * 1.5); }
      }
      // Slowly evolving flow, smooth boundaries, and individual swimming variation.
      fx += this.flowX[row]; fy += this.flowY[col];
      const wander = wanderSin * this.phaseCos[i] + wanderCos * this.phaseSin[i];
      const speed0 = this.swim[i] || 1;
      fx += -vy / speed0 * wander; fy += vx / speed0 * wander;
      const margin = 110;
      if (x < margin) fx += (margin - x) * 1.5;
      if (x > w - margin) fx -= (x - w + margin) * 1.5;
      if (y < margin) fy += (margin - y) * 1.5;
      if (y > h - margin) fy -= (y - h + margin) * 1.5;
      const tx = vx + fx * dt, ty = vy + fy * dt, inverse = 1 / (Math.sqrt(tx * tx + ty * ty) || 1);
      let ux = tx * inverse, uy = ty * inverse;
      const bin = Math.min(8, Math.round(fear * 8)), oldX = this.dx[i], oldY = this.dy[i];
      if (ux * oldX + uy * oldY < this.cosTurn[bin]) {
        const sign = oldX * uy - oldY * ux >= 0 ? 1 : -1, sine = this.sinTurn[bin] * sign;
        ux = oldX * this.cosTurn[bin] - oldY * sine; uy = oldY * this.cosTurn[bin] + oldX * sine;
        const normalize = 1 / (Math.sqrt(ux * ux + uy * uy) || 1); ux *= normalize; uy *= normalize;
      }
      this.energy[i] = clamp(this.energy[i] + dt * (fear > 0.45 ? -0.22 : 0.15), 0, 1);
      this.maturity[i] = Math.min(1, this.maturity[i] + dt / 50);
      const targetSpeed = traits.speed + this.size[i] * 13 + fear * (45 + this.energy[i] * 67) * traits.escape;
      const speed = speed0 + (targetSpeed - speed0) * Math.min(1, dt * 3);
      this.swim[i] = speed; this.dx[i] = ux; this.dy[i] = uy;
      this.nx[i] = this.dx[i] * speed; this.ny[i] = this.dy[i] * speed;
    }
    // Double buffers prevent iteration order from accelerating alarm propagation.
    [this.vx, this.nx] = [this.nx, this.vx]; [this.vy, this.ny] = [this.ny, this.vy];
    [this.fear, this.nextFear] = [this.nextFear, this.fear];
    for (let i = 0; i < this.count; i++) {
      this.x[i] = clamp(this.x[i] + this.vx[i] * dt, 4, w - 4);
      this.y[i] = clamp(this.y[i] + this.vy[i] * dt, 4, h - 4);
    }
    if (this.settings.predators) for (const p of this.predators) this.movePredator(p, dt);
    this.births += dt;
    if (this.births > 1) {
      this.births = 0;
      // A gentle replenishment keeps the ecosystem alive without erasing user-spawned fish.
      if (this.count < this.settings.population) {
        const parent = Math.floor(Math.random() * this.count);
        const amount = Math.min(30, Math.max(1, Math.ceil((this.settings.population - this.count) / 150)));
        this.spawn(this.count ? this.x[parent] : w * 0.5, this.count ? this.y[parent] : h * 0.5, amount, false,
          this.count ? Math.atan2(this.vy[parent], this.vx[parent]) : 0, 20, this.count ? this.species[parent] : this.settings.fishType);
      }
    }
  }
  private movePredator(p: Predator, dt: number) {
    const traits = PREDATOR_SPECIES[p.kind];
    p.rest -= dt; p.timer -= dt;
    if (p.target >= 0 && p.target < this.count && this.refuges.some(z => (this.x[p.target] - z.x) ** 2 + (this.y[p.target] - z.y) ** 2 < z.radius ** 2)) p.target = -1;
    if (p.rest <= 0 && (p.target < 0 || p.target >= this.count || (p.timer <= 0 && p.phase !== 2))) {
      p.timer = p.kind ? 0.85 : 1.6;
      let best = p.target >= 0 ? Math.hypot(this.x[p.target] - p.x, this.y[p.target] - p.y) + this.social[p.target] * (p.kind ? 7 : 13) - 90 : Infinity;
      for (let i = 0; i < this.count; i++) {
        if (this.refuges.some(z => (this.x[i] - z.x) ** 2 + (this.y[i] - z.y) ** 2 < z.radius ** 2)) continue;
        const d = Math.hypot(this.x[i] - p.x, this.y[i] - p.y);
        // Dense schools make a single target harder to select.
        const score = d + this.social[i] * (p.kind ? 7 : 13);
        if (score < best) { best = score; p.target = i; }
      }
    }
    let tx = this.width * (0.5 + Math.cos(this.time * 0.055 + p.identity * 2.3) * 0.35);
    let ty = this.height * (0.5 + Math.sin(this.time * 0.07 + p.identity * 1.7) * 0.32);
    let speed: number = traits.cruise, rate: number = traits.turn;
    const hunting = p.rest <= 0 && p.target >= 0;
    if (hunting) {
      p.huntTime += dt;
      const i = p.target, d = Math.hypot(this.x[i] - p.x, this.y[i] - p.y);
      const lead = p.kind === 2 ? 1.1 : 0.35;
      tx = this.x[i] + this.vx[i] * lead; ty = this.y[i] + this.vy[i] * lead;
      if (p.kind === 1) {
        if (p.phase !== 2 && d < 245) { p.phase = 2; p.burst = 1.7; }
        if (p.phase === 2) { speed = 235; rate = 0.68; p.burst -= dt; }
        else speed = 61;
        // A sprint ends whether it succeeds or misses; recovery is visibly slower.
        if (p.phase === 2 && p.burst <= 0) { p.rest = 7 + Math.random() * 5; p.phase = 0; }
      } else if (p.kind === 2) {
        speed = traits.chase; rate = traits.turn;
      } else if (p.kind === 3) {
        if (p.phase !== 2 && d < 125) { p.phase = 2; p.burst = 0.75; }
        if (p.phase === 2) {
          speed = traits.chase; p.burst -= dt;
          if (p.burst <= 0) { p.phase = 0; p.rest = 9 + Math.random() * 6; }
        } else { speed = traits.cruise; p.huntTime = 0; }
      } else { speed = d < 210 ? traits.chase : 69; }
      if (d < traits.reach && this.count > 30 && this.social[i] < 22 && !this.refuges.some(z => (this.x[i] - z.x) ** 2 + (this.y[i] - z.y) ** 2 < z.radius ** 2)) {
        this.effects.push({ x: this.x[i], y: this.y[i], age: 0, kind: 'catch' });
        this.removeFish(i); this.captures++;
        p.target = -1; p.rest = traits.rest * (0.7 + Math.random() * 0.6); p.phase = 0; p.huntTime = 0;
      }
    }
    if (p.huntTime > (p.kind ? 14 : 22)) { p.rest = 5 + Math.random() * 7; p.phase = 0; p.target = -1; p.huntTime = 0; }
    if (!hunting) p.huntTime = 0;
    if (p.x < 90) tx = 250; if (p.x > this.width - 90) tx = this.width - 250;
    if (p.y < 90) ty = 250; if (p.y > this.height - 90) ty = this.height - 250;
    let steerX = tx - p.x, steerY = ty - p.y;
    const steerLength = Math.hypot(steerX,steerY) || 1; steerX /= steerLength; steerY /= steerLength;
    for (const zone of this.refuges) {
      const zx = p.x - zone.x, zy = p.y - zone.y, d = Math.hypot(zx,zy), radius = zone.radius + 100;
      if (d < radius) { steerX += zx / (d || 1) * (1 - d / radius) * 6; steerY += zy / (d || 1) * (1 - d / radius) * 6; }
    }
    p.angle = turn(p.angle, Math.atan2(steerY, steerX), rate * dt);
    const v = Math.hypot(p.vx, p.vy) + (speed - Math.hypot(p.vx, p.vy)) * Math.min(1, dt * (p.kind === 3 && p.phase === 2 ? 8 : 2));
    p.vx = Math.cos(p.angle) * v; p.vy = Math.sin(p.angle) * v;
    p.x = clamp(p.x + p.vx * dt, 8, this.width - 8); p.y = clamp(p.y + p.vy * dt, 8, this.height - 8);
    if (Math.floor(this.time * 15) !== Math.floor((this.time - dt) * 15)) {
      p.trail.push(p.x, p.y); if (p.trail.length > 90) p.trail.splice(0, 2);
    }
  }
  snapshot(fps = 60): Snapshot {
    let alarm = 0; const fishCounts = [0,0,0], predatorCounts = [0,0,0,0];
    for (let i = 0; i < this.count; i++) { fishCounts[this.species[i]]++; if (this.fear[i] > 0.4) alarm++; }
    if (this.settings.predators) for (const predator of this.predators) predatorCounts[predator.kind]++;
    const p = this.settings.predators ? this.predators[this.following] : undefined;
    return { fishCounts, predatorCounts, event: this.event, automatic: this.automatic, renderer: this.gpuActive ? 'gpu' : 'canvas', stepMs: this.simulationMs, shelters: this.refuges.length, vortices: this.vortices.length, zoom: this.camera.zoom, captures: this.captures,
      focus: p ? `${PREDATOR_SPECIES[p.kind].name} ${String(p.ordinal).padStart(2, '0')}` : null,
      behavior: p ? (p.rest > 0 ? 'Erholt sich' : p.kind && p.phase === 2 ? 'Im Sprint' : p.kind === 3 ? 'Lauert auf Beute' : p.kind === 2 ? 'Fängt die Bahn ab' : p.huntTime > 0 ? 'Auf der Jagd' : 'Zieht seine Kreise') : '',
      count: this.count, sharks: predatorCounts[0], barracudas: predatorCounts[1],
      alarm: this.count ? Math.round(alarm / this.count * 100) : 0, elapsed: this.time, fps: Math.round(fps) };
  }
  draw(interpolation = 0) {
    const c = this.ctx; if (!c || !this.canvas) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale * this.pixelRatio * this.camera.zoom;
    c.setTransform(s, 0, 0, s, this.canvas.width / 2 - this.camera.x * s, this.canvas.height / 2 - this.camera.y * s);
    const left = this.camera.x - this.width / this.camera.zoom / 2 - 30, right = this.camera.x + this.width / this.camera.zoom / 2 + 30;
    const top = this.camera.y - this.height / this.camera.zoom / 2 - 30, bottom = this.camera.y + this.height / this.camera.zoom / 2 + 30;
    const t = this.time + interpolation;
    c.fillStyle = '#a5d9cc';
    for (const p of this.particles) {
      const x = ((p[0] * this.width + t * (1 + p[2] * 2)) % this.width);
      const y = (p[1] * this.height + Math.sin(t * 0.06 + p[0] * 20) * 20);
      c.globalAlpha = 0.06 + p[2] * 0.15; c.beginPath(); c.arc(x, y, 0.6 + p[2], 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    for (const food of this.foods) {
      c.fillStyle = '#d9c491';
      for (let k = 0; k < 20; k++) {
        const a = k * 2.4 + t * 0.07, r = 7 + (k * 13 % 35);
        c.globalAlpha = Math.min(1, food.life / 4) * 0.6;
        c.beginPath(); c.arc(food.x + Math.cos(a) * r, food.y + Math.sin(a) * r, 1.4, 0, TAU); c.fill();
      }
    }
    for (const zone of this.refuges) {
      c.globalAlpha = 0.10; c.fillStyle = '#69c9a8'; c.beginPath(); c.arc(zone.x,zone.y,zone.radius,0,TAU); c.fill();
      c.globalAlpha = 0.35; c.strokeStyle = '#83d7b8'; c.lineWidth = 1; c.setLineDash([3,8]); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 0.6; c.font = '12px Arial'; c.textAlign = 'center'; c.fillText('SCHUTZZONE',zone.x,zone.y + zone.radius + 20);
    }
    for (const zone of this.vortices) {
      c.globalAlpha = Math.min(1,zone.life / 8) * 0.22; c.strokeStyle = '#83c8d2'; c.lineWidth = 1;
      for (let arm = 0; arm < 3; arm++) {
        c.beginPath();
        for (let k = 0; k < 42; k++) {
          const r = 12 + k * 4.5, a = arm * TAU / 3 + k * 0.09 * zone.spin + t * 0.5 * zone.spin;
          const px = zone.x + Math.cos(a) * r, py = zone.y + Math.sin(a) * r;
          if (k === 0) c.moveTo(px,py); else c.lineTo(px,py);
        }
        c.stroke();
      }
    }
    this.gpuActive = this.renderer?.render(this,{ width: this.canvas.width, height: this.canvas.height, x: this.camera.x, y: this.camera.y, scale: s, time: this.time, interpolation, night: this.settings.night, alarm: this.settings.alarmView }) ?? false;
    const lightX = Math.sin(t * 0.07), lightY = Math.cos(t * 0.07);
    // Batch fish by brightness; a single filled path per batch keeps large schools inexpensive.
    for (let paint = 0; !this.gpuActive && paint < 12; paint++) {
      const band = paint % 4, species = Math.floor(paint / 4);
      c.fillStyle = (this.settings.alarmView ? ['#395c63','#395c63','#395c63','#ff914a'] : this.settings.night ? ['#376d77','#5b9a9f','#72cbbf','#9ae4cd'] : ['#639491', '#9cbeb7', '#d3e1cb', '#e1f2db'])[band];
      if (!this.settings.alarmView && species > 0) c.fillStyle = FISH_SPECIES[species].color;
      c.globalAlpha = [0.65, 0.8, 0.9, 0.95][band]; c.beginPath();
      for (let i = 0; i < this.count; i++) {
        if (this.species[i] !== species) continue;
        const b = this.fear[i] > 0.5 ? 3 : Math.floor((this.dx[i] * lightX + this.dy[i] * lightY + 1) * 1.49); if (b !== band) continue;
        const x = this.x[i] + this.vx[i] * interpolation, y = this.y[i] + this.vy[i] * interpolation;
        if (x < left || x > right || y < top || y > bottom) continue;
        const ux = this.dx[i], uy = this.dy[i], size = this.size[i] * (0.6 + this.maturity[i] * 0.4);
        const len = 5.5 * size, half = 1.65 * size * FISH_SPECIES[species].width;
        if (this.count > 6000 && this.camera.zoom < 1.6) {
          c.moveTo(x + ux * len,y + uy * len); c.lineTo(x - ux * len - uy * half,y - uy * len + ux * half);
          c.lineTo(x - ux * len + uy * half,y - uy * len - ux * half); c.closePath(); continue;
        }
        const wiggle = Math.sin(t * (14 + this.fear[i] * 12) + this.phase[i]) * 1.3 * size;
        c.moveTo(x + ux * len, y + uy * len);
        c.quadraticCurveTo(x - uy * half * 1.7, y + ux * half * 1.7, x - ux * len * 0.62 - uy * wiggle, y - uy * len * 0.62 + ux * wiggle);
        c.lineTo(x - ux * len - uy * (wiggle + half), y - uy * len + ux * (wiggle + half));
        c.lineTo(x - ux * len - uy * (wiggle - half), y - uy * len + ux * (wiggle - half));
        c.lineTo(x - ux * len * 0.62 - uy * wiggle, y - uy * len * 0.62 + ux * wiggle);
        c.quadraticCurveTo(x + uy * half * 1.7, y - ux * half * 1.7, x + ux * len, y + uy * len); c.closePath();
      }
      c.fill();
    }
    if (this.settings.predators) for (const p of this.predators) {
      if (this.settings.trails && p.trail.length > 4) {
        c.globalAlpha = 0.1; c.strokeStyle = PREDATOR_SPECIES[p.kind].color; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.trail[0], p.trail[1]);
        for (let k = 2; k < p.trail.length; k += 2) c.lineTo(p.trail[k], p.trail[k + 1]); c.stroke();
      }
      c.save(); c.translate(p.x + p.vx * interpolation, p.y + p.vy * interpolation); c.rotate(p.angle); c.globalAlpha = 1;
      const wag = Math.sin(t * (p.kind && p.phase === 2 ? 17 : 6)) * (p.kind ? 3 : 5);
      c.fillStyle = PREDATOR_SPECIES[p.kind].color; c.strokeStyle = PREDATOR_SPECIES[p.kind].color; c.lineWidth = 0.7;
      c.beginPath();
      if (p.kind === 3) {
        for (let k = -3; k <= 3; k++) {
          c.moveTo(k * 5,0); c.lineTo(k * 7 - 8,-23 + Math.abs(k) * 2); c.lineTo(k * 5 + 3,0);
          c.moveTo(k * 5,0); c.lineTo(k * 7 - 8,23 - Math.abs(k) * 2); c.lineTo(k * 5 + 3,0);
        }
        c.moveTo(23,0); c.quadraticCurveTo(8,-14,-14,-7); c.lineTo(-29,wag - 10); c.lineTo(-27,wag + 10);
        c.lineTo(-14,7); c.quadraticCurveTo(8,14,23,0);
      } else if (p.kind === 2) {
        c.moveTo(32,0); c.quadraticCurveTo(10,-12,-18,-3); c.lineTo(-35,wag-16); c.lineTo(-27,wag);
        c.lineTo(-35,wag+16); c.lineTo(-18,3); c.quadraticCurveTo(10,12,32,0);
        c.moveTo(4,-6); c.lineTo(-9,-16); c.lineTo(-5,-4); c.moveTo(4,6); c.lineTo(-9,16); c.lineTo(-5,4);
      } else if (p.kind === 1) {
        c.moveTo(25, 0); c.quadraticCurveTo(9, -5, -17, -2); c.lineTo(-29, wag - 6);
        c.lineTo(-25, wag); c.lineTo(-29, wag + 6); c.lineTo(-17, 2);
        c.quadraticCurveTo(9, 5, 25, 0);
      } else {
        c.moveTo(32, 0); c.quadraticCurveTo(22, -10, 7, -7); c.lineTo(-5, -20); c.lineTo(-5, -6);
        c.quadraticCurveTo(-15, -5, -24, wag - 2); c.lineTo(-38, wag - 13); c.lineTo(-33, wag);
        c.lineTo(-37, wag + 12); c.lineTo(-23, wag + 2); c.quadraticCurveTo(-15, 5, -5, 6);
        c.lineTo(-5, 20); c.lineTo(7, 7); c.quadraticCurveTo(22, 10, 32, 0);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#163334'; c.beginPath(); c.arc(p.kind ? 15 : 22, -2, 1, 0, TAU); c.fill();
      c.restore();
      if (this.predators[this.following] === p) {
        c.globalAlpha = 0.4; c.strokeStyle = '#d5e9d4'; c.lineWidth = 0.7 / this.camera.zoom;
        const radius = p.kind ? 36 : 46;
        for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(p.x, p.y, radius, k * Math.PI / 2 + 0.2, k * Math.PI / 2 + 0.65); c.stroke(); }
      }
    }
    for (const e of this.effects) {
      const duration = e.kind === 'wave' ? 2.8 : 1.5;
      c.globalAlpha = (1 - e.age / duration) * 0.45;
      c.strokeStyle = e.kind === 'food' ? '#d9c491' : e.kind === 'wave' ? '#badcd5' : '#9fe3c5';
      c.lineWidth = 1; c.beginPath(); c.arc(e.x, e.y, e.age * (e.kind === 'wave' ? 230 : 45) + 10, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
  }
}
