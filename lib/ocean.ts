export type Tool = 'fish' | 'food' | 'wave';
export type Settings = { speed: number; population: number; cohesion: number; predators: boolean; trails: boolean; current: number };
export type Snapshot = { count: number; sharks: number; barracudas: number; alarm: number; elapsed: number; fps: number };
type Predator = { x: number; y: number; vx: number; vy: number; angle: number; kind: number; phase: number; timer: number; target: number; rest: number; burst: number; trail: number[] };
type Effect = { x: number; y: number; age: number; kind: Tool | 'catch' };
const TAU = Math.PI * 2;
const MAX = 4000;
const CELL = 70;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const turn = (from: number, to: number, limit: number) => from + clamp(Math.atan2(Math.sin(to - from), Math.cos(to - from)), -limit, limit);

/** Fixed-step local-neighbor simulation. Rendering never drives the simulation clock. */
export class Ocean {
  x = new Float32Array(MAX); y = new Float32Array(MAX);
  vx = new Float32Array(MAX); vy = new Float32Array(MAX);
  nx = new Float32Array(MAX); ny = new Float32Array(MAX);
  fear = new Float32Array(MAX); nextFear = new Float32Array(MAX);
  phase = new Float32Array(MAX); size = new Float32Array(MAX); social = new Uint8Array(MAX);
  next = new Int32Array(MAX); heads = new Int32Array(1);
  count = 0; width = 1800; height = 1100; cols = 1; rows = 1;
  time = 0; births = 0; predators: Predator[] = []; effects: Effect[] = [];
  foods: { x: number; y: number; life: number }[] = [];
  settings: Settings = { speed: 1, population: 1200, cohesion: 1, predators: true, trails: true, current: 0.45 };
  paused = false;
  private ctx: CanvasRenderingContext2D | null;
  private canvas: HTMLCanvasElement | null;
  private scale = 1; private pixelRatio = 1;
  private particles = Array.from({ length: 95 }, () => [Math.random(), Math.random(), Math.random()]);

  constructor(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: true }) ?? null;
    this.resize(1440, 880);
    this.reset();
  }
  resize(w: number, h: number) {
    const oldW = this.width, oldH = this.height;
    this.scale = Math.min(w / 1500, h / 850);
    this.width = w / this.scale; this.height = h / this.scale;
    for (let i = 0; i < this.count; i++) { this.x[i] *= this.width / oldW; this.y[i] *= this.height / oldH; }
    for (const p of this.predators) { p.x *= this.width / oldW; p.y *= this.height / oldH; p.trail.length = 0; }
    for (const item of [...this.foods, ...this.effects]) { item.x *= this.width / oldW; item.y *= this.height / oldH; }
    this.cols = Math.ceil(this.width / CELL); this.rows = Math.ceil(this.height / CELL);
    this.heads = new Int32Array(this.cols * this.rows);
    if (this.canvas) {
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * this.pixelRatio); this.canvas.height = Math.round(h * this.pixelRatio);
    }
  }
  reset() {
    this.count = 0; this.time = 0; this.births = 0; this.effects = []; this.foods = [];
    for (let g = 0; g < 7; g++) {
      const a = g / 7 * TAU;
      const cx = this.width * (0.5 + Math.cos(a) * 0.27), cy = this.height * (0.5 + Math.sin(a) * 0.25);
      this.spawn(cx, cy, Math.floor(this.settings.population / 7), false, a + Math.PI / 2, 135);
    }
    this.predators = Array.from({ length: 5 }, (_, i) => ({
      x: this.width * (0.15 + i * 0.16), y: this.height * (i % 2 ? 0.18 : 0.8),
      vx: 35, vy: 0, angle: i * 1.3, kind: i < 2 ? 0 : 1, phase: i * 3, timer: 3 + i * 2,
      target: -1, rest: 3 + i * 2, burst: 0, trail: [],
    }));
  }
  spawn(x: number, y: number, amount = 28, effect = true, heading = Math.random() * TAU, spread = 32) {
    const before = this.count;
    for (let k = 0; k < amount && this.count < MAX; k++) {
      const i = this.count++, a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread;
      this.x[i] = clamp(x + Math.cos(a) * r, 12, this.width - 12);
      this.y[i] = clamp(y + Math.sin(a) * r * 0.65, 12, this.height - 12);
      const dir = heading + (Math.random() - 0.5) * 0.8;
      this.vx[i] = Math.cos(dir) * 45; this.vy[i] = Math.sin(dir) * 45;
      this.phase[i] = Math.random() * TAU; this.size[i] = 0.7 + Math.random() * 0.6;
      this.fear[i] = 0; this.social[i] = 0;
    }
    if (effect) this.effects.push({ x, y, age: 0, kind: 'fish' });
    return this.count - before;
  }
  interact(tool: Tool, x: number, y: number, world = false) {
    if (!world) { x /= this.scale; y /= this.scale; }
    x = clamp(x, 10, this.width - 10); y = clamp(y, 10, this.height - 10);
    if (tool === 'fish') return this.spawn(x, y);
    if (tool === 'food') { if (this.foods.length >= 12) this.foods.shift(); this.foods.push({ x, y, life: 25 }); }
    if (this.effects.length >= 40) this.effects.shift();
    this.effects.push({ x, y, age: 0, kind: tool });
    return 0;
  }
  private grid() {
    this.heads.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const cell = clamp(Math.floor(this.x[i] / CELL), 0, this.cols - 1) + clamp(Math.floor(this.y[i] / CELL), 0, this.rows - 1) * this.cols;
      this.next[i] = this.heads[cell]; this.heads[cell] = i;
    }
  }
  step(dt: number) {
    this.time += dt; this.grid();
    this.effects = this.effects.filter(e => (e.age += dt) < (e.kind === 'wave' ? 2.8 : 1.5));
    this.foods = this.foods.filter(f => (f.life -= dt) > 0);
    const w = this.width, h = this.height, t = this.time;
    for (let i = 0; i < this.count; i++) {
      const x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i];
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, neighbors = 0, alarm = 0;
      const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
      for (let r = Math.max(0, row - 1); r <= Math.min(this.rows - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(this.cols - 1, col + 1); c++) {
          let j = this.heads[r * this.cols + c], visits = 0;
          while (j !== -1 && visits++ < 100) {
            if (j !== i) {
              const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
              if (d2 < 65 * 65 && d2 > 0.01) {
                if (d2 < 17 * 17) { sx -= dx / (d2 + 4); sy -= dy / (d2 + 4); }
                // A broad forward field of view, with close neighbors always visible.
                if (dx * vx + dy * vy > -Math.sqrt(d2) * 25 || d2 < 24 * 24) {
                  ax += this.vx[j]; ay += this.vy[j]; cx += dx; cy += dy; neighbors++;
                  if (d2 < 43 * 43) alarm = Math.max(alarm, this.fear[j] * 0.965);
                }
              }
            }
            j = this.next[j];
          }
        }
      }
      this.social[i] = Math.min(255, neighbors);
      let fx = sx * 1200, fy = sy * 1200;
      if (neighbors) {
        fx += (ax / neighbors - vx) * 1.6 + cx / neighbors * 0.9 * this.settings.cohesion;
        fy += (ay / neighbors - vy) * 1.6 + cy / neighbors * 0.9 * this.settings.cohesion;
      } else {
        // Lonely fish scan a wider neighborhood periodically and steer toward an actual fish.
        const j = (i * 137 + Math.floor(t * 0.35) * 73) % Math.max(1, this.count);
        const dx = this.x[j] - x, dy = this.y[j] - y, d = Math.hypot(dx, dy) || 1;
        fx += dx / d * 24; fy += dy / d * 24;
      }
      let direct = 0;
      if (this.settings.predators) for (const p of this.predators) {
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        const radius = p.kind === 0 ? 145 : (p.phase === 2 ? 175 : 95);
        if (d < radius) {
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
      const fear = Math.max(this.fear[i] - dt * 0.55, alarm - dt * 0.025, direct);
      this.nextFear[i] = fear;
      if (fear < 0.3) for (const food of this.foods) {
        const dx = food.x - x, dy = food.y - y, d = Math.hypot(dx, dy);
        if (d < 410) { fx += dx / (d || 1) * Math.min(60, d * 1.5); fy += dy / (d || 1) * Math.min(60, d * 1.5); }
      }
      // Slowly evolving flow, smooth boundaries, and individual swimming variation.
      fx += Math.cos(y * 0.003 + t * 0.055) * this.settings.current * 18;
      fy += Math.sin(x * 0.003 - t * 0.045) * this.settings.current * 18;
      const wander = Math.sin(t * 0.7 + this.phase[i]) * 10;
      const speed0 = Math.hypot(vx, vy) || 1;
      fx += -vy / speed0 * wander; fy += vx / speed0 * wander;
      const margin = 110;
      if (x < margin) fx += (margin - x) * 1.5;
      if (x > w - margin) fx -= (x - w + margin) * 1.5;
      if (y < margin) fy += (margin - y) * 1.5;
      if (y > h - margin) fy -= (y - h + margin) * 1.5;
      const desired = Math.atan2(vy + fy * dt, vx + fx * dt);
      const angle = turn(Math.atan2(vy, vx), desired, (2.4 + fear * 3) * dt);
      const targetSpeed = 39 + this.size[i] * 13 + fear * 100;
      const speed = speed0 + (targetSpeed - speed0) * Math.min(1, dt * 3);
      this.nx[i] = Math.cos(angle) * speed; this.ny[i] = Math.sin(angle) * speed;
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
        const amount = Math.min(4, Math.max(1, Math.ceil((this.settings.population - this.count) / 150)));
        this.spawn(this.count ? this.x[parent] : w * 0.5, this.count ? this.y[parent] : h * 0.5, amount, false,
          this.count ? Math.atan2(this.vy[parent], this.vx[parent]) : 0, 20);
      }
    }
  }
  private movePredator(p: Predator, dt: number) {
    p.rest -= dt; p.timer -= dt;
    if (p.timer <= 0 || p.target >= this.count) {
      p.timer = p.kind ? 0.85 : 1.6;
      let best = Infinity; p.target = -1;
      for (let i = 0; i < this.count; i += 2) {
        const d = Math.hypot(this.x[i] - p.x, this.y[i] - p.y);
        // Dense schools make a single target harder to select.
        const score = d + this.social[i] * (p.kind ? 7 : 13);
        if (score < best) { best = score; p.target = i; }
      }
    }
    let tx = this.width * (0.5 + Math.cos(this.time * 0.055 + p.kind * 3 + p.phase) * 0.35);
    let ty = this.height * (0.5 + Math.sin(this.time * 0.07 + p.kind * 4 + p.phase) * 0.32);
    let speed = p.kind ? 38 : 48, rate = p.kind ? 1.8 : 0.85;
    const hunting = p.rest <= 0 && p.target >= 0;
    if (hunting) {
      const i = p.target, d = Math.hypot(this.x[i] - p.x, this.y[i] - p.y);
      tx = this.x[i] + this.vx[i] * 0.35; ty = this.y[i] + this.vy[i] * 0.35;
      if (p.kind) {
        if (p.phase !== 2 && d < 245) { p.phase = 2; p.burst = 1.7; }
        if (p.phase === 2) { speed = 235; rate = 0.68; p.burst -= dt; }
        else speed = 61;
        // A sprint ends whether it succeeds or misses; recovery is visibly slower.
        if (p.phase === 2 && p.burst <= 0) { p.rest = 7 + Math.random() * 5; p.phase = 0; }
      } else { speed = d < 210 ? 112 : 69; rate = 1.1; }
      if (d < (p.kind ? 14 : 20) && this.count > 30 && this.social[i] < 22) {
        this.effects.push({ x: this.x[i], y: this.y[i], age: 0, kind: 'catch' });
        const last = --this.count;
        for (const field of [this.x, this.y, this.vx, this.vy, this.fear, this.phase, this.size, this.social]) field[i] = field[last];
        p.target = -1; p.rest = 12 + Math.random() * 13; p.phase = 0;
      }
    }
    if (p.x < 90) tx = 250; if (p.x > this.width - 90) tx = this.width - 250;
    if (p.y < 90) ty = 250; if (p.y > this.height - 90) ty = this.height - 250;
    p.angle = turn(p.angle, Math.atan2(ty - p.y, tx - p.x), rate * dt);
    const v = Math.hypot(p.vx, p.vy) + (speed - Math.hypot(p.vx, p.vy)) * Math.min(1, dt * 2);
    p.vx = Math.cos(p.angle) * v; p.vy = Math.sin(p.angle) * v;
    p.x = clamp(p.x + p.vx * dt, 8, this.width - 8); p.y = clamp(p.y + p.vy * dt, 8, this.height - 8);
    if (Math.floor(this.time * 15) !== Math.floor((this.time - dt) * 15)) {
      p.trail.push(p.x, p.y); if (p.trail.length > 90) p.trail.splice(0, 2);
    }
  }
  snapshot(fps = 60): Snapshot {
    let alarm = 0; for (let i = 0; i < this.count; i++) if (this.fear[i] > 0.4) alarm++;
    return { count: this.count, sharks: this.settings.predators ? 2 : 0, barracudas: this.settings.predators ? 3 : 0,
      alarm: this.count ? Math.round(alarm / this.count * 100) : 0, elapsed: this.time, fps: Math.round(fps) };
  }
  draw(interpolation = 0) {
    const c = this.ctx; if (!c || !this.canvas) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale * this.pixelRatio; c.setTransform(s, 0, 0, s, 0, 0);
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
    // Batch fish by brightness; a single filled path per batch keeps large schools inexpensive.
    for (let band = 0; band < 4; band++) {
      c.fillStyle = ['#709e9f', '#9ebcba', '#c4d6ce', '#c9eae0'][band];
      c.globalAlpha = [0.65, 0.8, 0.9, 0.95][band]; c.beginPath();
      for (let i = 0; i < this.count; i++) {
        const b = this.fear[i] > 0.5 ? 3 : i % 3; if (b !== band) continue;
        const x = this.x[i] + this.vx[i] * interpolation, y = this.y[i] + this.vy[i] * interpolation, speed = Math.hypot(this.vx[i], this.vy[i]) || 1;
        const ux = this.vx[i] / speed, uy = this.vy[i] / speed, size = this.size[i];
        const len = 5.5 * size, half = 1.65 * size;
        const wiggle = Math.sin(t * (14 + this.fear[i] * 12) + this.phase[i]) * 1.3 * size;
        c.moveTo(x + ux * len, y + uy * len);
        c.lineTo(x - uy * half, y + ux * half);
        c.lineTo(x - ux * len * 0.62 - uy * wiggle, y - uy * len * 0.62 + ux * wiggle);
        c.lineTo(x - ux * len - uy * (wiggle + half), y - uy * len + ux * (wiggle + half));
        c.lineTo(x - ux * len - uy * (wiggle - half), y - uy * len + ux * (wiggle - half));
        c.lineTo(x - ux * len * 0.62 - uy * wiggle, y - uy * len * 0.62 + ux * wiggle);
        c.lineTo(x + uy * half, y - ux * half); c.closePath();
      }
      c.fill();
    }
    if (this.settings.predators) for (const p of this.predators) {
      if (this.settings.trails && p.trail.length > 4) {
        c.globalAlpha = 0.1; c.strokeStyle = p.kind ? '#e4ba7c' : '#8ab8b4'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.trail[0], p.trail[1]);
        for (let k = 2; k < p.trail.length; k += 2) c.lineTo(p.trail[k], p.trail[k + 1]); c.stroke();
      }
      c.save(); c.translate(p.x + p.vx * interpolation, p.y + p.vy * interpolation); c.rotate(p.angle); c.globalAlpha = 1;
      const wag = Math.sin(t * (p.kind && p.phase === 2 ? 17 : 6)) * (p.kind ? 3 : 5);
      c.fillStyle = p.kind ? '#c4a47d' : '#729f9e'; c.strokeStyle = p.kind ? '#e7c69b' : '#a0c2bd'; c.lineWidth = 0.7;
      c.beginPath();
      if (p.kind) {
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
