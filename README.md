# Schwarm

An interactive 2D ocean built with Canvas, React and Vinext. German interface.

- Click or hold to introduce sardines; `1` selects fish, `2` food, `3` a scare wave.
- Two-finger trackpad scroll pans horizontally and vertically with native momentum; pinch (including Safari gesture events) or +/− zooms. Shift-drag still pans. `F` follows the next predator; `0` returns to the full view. In observation mode, dragging pans and clicking never spawns fish.
- Space pauses time, `H` hides the interface, Escape restores it. Enter on the canvas uses the active tool at the center.
- Sharks pursue isolated fish. Barracudas stalk, sprint and recover.
- Released fish grow over 50 simulated seconds. Escape bursts consume energy that replenishes during calm periods. Predators retain targets, commit to sprints and abandon exhausting pursuits.
- Fish separate, align, cohere and react to nearby alarm signals. A gentle replenishment maintains the selected carrying population. Lowering it does not delete fish.
- The population is capped at 100,000. Counting-sort spatial buckets and at most six rotating samples per neighboring cell bound neighbor work independently of local density. Direction updates use vector rotation instead of repeated angle conversion. Physics runs at 30 Hz, or 20/15 Hz above 30,000/60,000 fish, with interpolated drawing and bounded catch-up work; background tabs suspend simulation. WebGL2 renders every fish in one instanced draw. Context loss or unsupported hardware falls back to batched Canvas drawing. Typed arrays, bounded effects and capped pixel density keep resource use predictable.
- Settings are saved on this device. The simulation itself starts fresh on reload.

## Run

`npm install` then `npm run dev`. `npm run build` produces the hosting output.

## Checks

`npx tsc --noEmit`

`node --experimental-strip-types tests/ocean.test.ts`

The deterministic simulation check covers ten simulated minutes, predator catches, sprint speed, population recovery, bounds, expiring food, a dense 100,000-fish case and resizing. It does not measure browser rendering performance.

Optional WebMCP tools (`read_ocean`, `interact_with_ocean`) register only in browsers supporting `document.modelContext`. Native WebMCP validation was unavailable in this environment.

This is a stylized model, not a biological experiment. No unsupported catch probabilities from the referenced reel are presented as facts.

## New interactions

- `4`: place a 65-second vortex. Clicking its center again reverses it.
- `5`: place a refuge where predators cannot catch fish; maximum six refuges.
- `6`: remove the nearest placed food source, vortex or refuge.
- `C`: toggle a camera that changes subjects automatically. Manual pan cancels it.
- Settings include 25–500 fish per click, filling the selected population immediately, three new-world scenarios, night colors and a danger overlay.
- Natural events periodically add plankton blooms, vortices or visiting schools. They can be disabled.

`node --experimental-strip-types tests/performance.ts` measures 4,000, 20,000 and 100,000 fish. An optional path to an older engine enables a same-world comparison. Results measure physics only, not browser frame rate. Browser/GPU timing and native WebMCP validation were not available in this task.

## Species

Sardines (silver) school steadily; anchovies (blue) are smaller and form tighter groups; mackerel (gold-green) cruise faster in looser groups. Fish prefer their own species but share alarm signals across species. Offspring inherit their parent's type.

Sharks pursue stragglers; barracudas sprint and recover; tuna lead moving targets; lionfish approach slowly and lunge at close range. Shapes, colors and the tracking camera distinguish all four. These are stylized simulation traits.

Choose a fish in the selector above the toolbar. Tool `7` selects predator placement, with its own species selector. Predators must be enabled; a shared limit of 16 bounds cost. Species counts are live, and all fish share the 100,000 population limit. The WebMCP interaction tool accepts an optional numeric species index as documented in its schema.
