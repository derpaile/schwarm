import type { Ocean, Tool } from './ocean';
type Context = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }) => void | Promise<void> };
export function registerOceanTools(ocean: Ocean, context?: Context) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = (tool: Parameters<Context['registerTool']>[0]) => {
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability. */ }
  };
  register({ name: 'read_ocean', description: 'Read the current fish population, predators, alarm level, and simulated time.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => ocean.snapshot() });
  register({ name: 'interact_with_ocean', description: 'Add a group of fish, a food source, or a scare wave at a relative position in the visible ocean.',
    inputSchema: { type: 'object', properties: { tool: { type: 'string', enum: ['fish', 'food', 'wave'] }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }, required: ['tool', 'x', 'y'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => {
      if (!input || typeof input !== 'object') throw new Error('Expected tool, x and y.');
      const v = input as Record<string, unknown>;
      if (!['fish', 'food', 'wave'].includes(String(v.tool)) || typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1 || Object.keys(v).some(k => !['tool', 'x', 'y'].includes(k))) throw new Error('Tool must be fish, food or wave; coordinates must be between 0 and 1.');
      const added = ocean.interact(v.tool as Tool, v.x * ocean.width, v.y * ocean.height, true); ocean.draw();
      return { added, ...ocean.snapshot() };
    } });
  return () => lifecycle.abort();
}
export type { Context as OceanModelContext };
