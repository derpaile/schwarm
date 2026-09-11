// One instanced draw for the entire population; no per-fish Canvas paths.
export type FishFrame = { count: number; species: Uint8Array; x: Float32Array; y: Float32Array; dx: Float32Array; dy: Float32Array; size: Float32Array; phase: Float32Array; fear: Float32Array; maturity: Float32Array; swim: Float32Array };
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 shape;
layout(location=1) in vec4 positionDirection;
layout(location=2) in vec4 traits;
layout(location=3) in float species;
uniform vec2 viewport;
uniform vec2 camera;
uniform float scale;
uniform float time;
uniform float interpolation;
uniform bool night;
uniform bool alarmView;
out vec4 color;
void main() {
  vec2 direction = positionDirection.zw;
  vec2 side = vec2(-direction.y, direction.x);
  float fear = traits.z;
  float bend = sin(time * (14.0 + fear * 12.0) + traits.y) * 0.18;
  vec2 local = shape;
  local.y *= species < 0.5 ? 1.0 : species < 1.5 ? 0.78 : 1.15;
  local.y += bend * max(0.0, -local.x);
  vec2 center = positionDirection.xy + direction * traits.w * interpolation;
  vec2 point = center + (direction * local.x + side * local.y) * traits.x * 5.5;
  vec2 screen = (point - camera) * scale / viewport * 2.0;
  gl_Position = vec4(screen.x, -screen.y, 0.0, 1.0);
  float light = (dot(direction, vec2(sin(time * 0.07), cos(time * 0.07))) + 1.0) * 0.5;
  vec3 silver = mix(vec3(0.30,0.53,0.53),vec3(0.80,0.90,0.82),light);
  if (species > 0.5 && species < 1.5) silver = mix(vec3(0.24,0.48,0.67),vec3(0.60,0.84,0.97),light);
  if (species > 1.5) silver = mix(vec3(0.43,0.47,0.26),vec3(0.88,0.80,0.55),light);
  silver = mix(silver, vec3(0.84,0.96,0.85),fear * 0.7);
  if (night) silver = mix(silver,vec3(0.28,0.83,0.82),0.48);
  if (alarmView) silver = mix(vec3(0.23,0.43,0.46),vec3(1.0,0.56,0.28),fear);
  color = vec4(silver,0.7 + light * 0.25);
}`;
const fragment = `#version 300 es
precision highp float;
in vec4 color;
out vec4 pixel;
void main() { pixel = color; }`;

export class FishRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private geometry: WebGLBuffer;
  private instances: WebGLBuffer;
  private data: Float32Array;
  private locations: Record<string, WebGLUniformLocation | null> = {};
  private lost = false;
  private contextLost = (e: Event) => { e.preventDefault(); this.lost = true; };
  static create(canvas: HTMLCanvasElement, max: number) {
    try { return new FishRenderer(canvas, max); } catch { canvas.width = canvas.width; return null; }
  }
  private constructor(privateCanvas: HTMLCanvasElement, max: number) {
    const gl = privateCanvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl; this.data = new Float32Array(max * 9);
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind); if (!shader) throw new Error('Shader allocation failed');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Fish shader compilation failed'); }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram(); if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Fish shader link failed'); }
    this.program = program;
    const vao = gl.createVertexArray(), geometry = gl.createBuffer(), instances = gl.createBuffer();
    if (!vao || !geometry || !instances) throw new Error('Fish buffer allocation failed');
    this.vao = vao; this.geometry = geometry; this.instances = instances;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1,0, -.05,.28, -.65,0, 1,0, -.65,0, -.05,-.28, -.65,0, -1,.30, -1,-.30]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,instances); gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
    for (let location = 1; location <= 2; location++) {
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,4,gl.FLOAT,false,36,(location-1)*16); gl.vertexAttribDivisor(location,1);
    }
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,1,gl.FLOAT,false,36,32); gl.vertexAttribDivisor(3,1);
    for (const name of ['viewport','camera','scale','time','interpolation','night','alarmView']) this.locations[name] = gl.getUniformLocation(program,name);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    privateCanvas.addEventListener('webglcontextlost',this.contextLost);
  }
  render(fish: FishFrame, view: { width: number; height: number; x: number; y: number; scale: number; time: number; interpolation: number; night: boolean; alarm: boolean }) {
    if (this.lost || this.gl.isContextLost()) return false;
    const gl = this.gl;
    if (gl.canvas.width !== view.width || gl.canvas.height !== view.height) { gl.canvas.width = view.width; gl.canvas.height = view.height; }
    gl.viewport(0,0,view.width,view.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    const data = this.data;
    for (let i = 0; i < fish.count; i++) {
      const k = i * 9;
      data[k] = fish.x[i]; data[k+1] = fish.y[i]; data[k+2] = fish.dx[i]; data[k+3] = fish.dy[i];
      data[k+4] = fish.size[i] * (0.6 + fish.maturity[i] * 0.4); data[k+5] = fish.phase[i]; data[k+6] = fish.fear[i]; data[k+7] = fish.swim[i]; data[k+8] = fish.species[i];
    }
    gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,fish.count * 9);
    gl.uniform2f(this.locations.viewport,view.width,view.height); gl.uniform2f(this.locations.camera,view.x,view.y);
    gl.uniform1f(this.locations.scale,view.scale); gl.uniform1f(this.locations.time,view.time);
    gl.uniform1f(this.locations.interpolation,view.interpolation); gl.uniform1i(this.locations.night,Number(view.night)); gl.uniform1i(this.locations.alarmView,Number(view.alarm));
    gl.drawArraysInstanced(gl.TRIANGLES,0,9,fish.count);
    return true;
  }
  dispose() {
    const gl = this.gl;
    gl.canvas.removeEventListener('webglcontextlost',this.contextLost);
    gl.deleteBuffer(this.geometry); gl.deleteBuffer(this.instances); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
  }
}
