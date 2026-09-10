# Schwarm

An interactive 2D ocean built with Canvas, React and Vinext. German interface.

- Click or hold to introduce sardines; `1` selects fish, `2` food, `3` a scare wave.
- Space pauses time, `H` hides the interface, Escape restores it. Enter on the canvas uses the active tool at the center.
- Sharks pursue isolated fish. Barracudas stalk, sprint and recover.
- Fish separate, align, cohere and react to nearby alarm signals. A gentle replenishment maintains the selected carrying population. Lowering it does not delete fish.
- The population is capped at 4,000. A spatial grid bounds neighbor searches. Physics runs at a fixed 30 Hz with interpolated drawing; background tabs suspend simulation. Typed arrays, batched fish paths, bounded effects and capped pixel density keep resource use predictable.
- Settings are saved on this device. The simulation itself starts fresh on reload.

## Run

`npm install` then `npm run dev`. `npm run build` produces the hosting output.

## Checks

`npx tsc --noEmit`

`node --experimental-strip-types tests/ocean.test.ts`

The deterministic simulation check covers ten simulated minutes, predator catches, sprint speed, population recovery, bounds, expiring food, a dense 4,000-fish case and resizing. It does not measure browser rendering performance.

Optional WebMCP tools (`read_ocean`, `interact_with_ocean`) register only in browsers supporting `document.modelContext`. Native WebMCP validation was unavailable in this environment.

This is a stylized model, not a biological experiment. No unsupported catch probabilities from the referenced reel are presented as facts.
