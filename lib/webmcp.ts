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
  register({ name: 'interact_with_ocean', description: 'Add a selected fish or predator species, food, a scare wave, a vortex or a refuge, or erase the closest placed object at a relative position in the visible ocean.',
    inputSchema: { type: 'object', properties: { species: { type: 'integer', minimum: 0, maximum: 3, description: 'Optional for fish: 0 sardine, 1 anchovy, 2 mackerel. For predator: 0 shark, 1 barracuda, 2 tuna, 3 lionfish. Otherwise omit.' }, tool: { type: 'string', enum: ['fish', 'food', 'wave', 'vortex', 'refuge', 'erase', 'predator'] }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }, required: ['tool', 'x', 'y'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => {
      if (!input || typeof input !== 'object') throw new Error('Expected tool, x and y.');
      const v = input as Record<string, unknown>;
      if (!['fish', 'food', 'wave', 'vortex', 'refuge', 'erase', 'predator'].includes(String(v.tool)) || typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1 || Object.keys(v).some(k => !['tool', 'x', 'y', 'species'].includes(k))) throw new Error('Unsupported ocean tool; coordinates must be between 0 and 1.');
      if (v.species !== undefined && ((!['fish','predator'].includes(String(v.tool))) || typeof v.species !== 'number' || !Number.isInteger(v.species) || v.species < 0 || v.species > (v.tool === 'fish' ? 2 : 3))) throw new Error('Invalid species for this tool');
      const added = ocean.interact(v.tool as Tool, ocean.camera.x + (v.x - 0.5) * ocean.width / ocean.camera.zoom, ocean.camera.y + (v.y - 0.5) * ocean.height / ocean.camera.zoom, true, v.species as number | undefined); ocean.draw();
      return { added, ...ocean.snapshot() };
    } });
  return () => lifecycle.abort();
}
export type { Context as OceanModelContext };
