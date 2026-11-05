# Chapter One plan

Source: "Downriver: Chapter One build prompt" (Oscar, 2026-11-05). Scope is the opening, the story frame, Spring Peaks, and two travel features: going back upstream, and the sky view. Every other world stays a sketch.

## Build order
1. **Look foundation.** These are shared, so the other worlds get them for free.
   - A paint shader patch on every toon material: noise color variation, ambient that follows the local up with blue-violet shadows, a warm rim light, and drifting cloud shadows.
   - A soft 3-band ramp, ink outlines, wind uniforms, and a day and night cycle with a moon.
2. **Spring Peaks look.**
   - Green alpine palette, wind grass (instanced tufts in chunks culled by horizon and distance), flowers, and painted cumulus towers.
   - Ochre paths, Ghibli-style houses with smoke and laundry, trees, the old tree with chimes, and a windmill.
3. **People.**
   - One `Person` builder for Rill and every NPC: face, blink, look-at, hair, coat, scarf, satchel, poses and gestures.
   - Fold rebuilt as folded paper, with a kite form.
4. **Story frame** (`src/story/`, text in `src/data/story.ts`): title, waking, the letter, the home light, the chapter card, the goal line, and the journal's main quest.
5. **Chapter One content** (`src/world/peaks.ts`, `src/story/chapterOne.ts`):
   - Odo and the old bridge, Kite Ridge, the goat terraces, Cloud Meadow and the 5 echo stones.
   - Side quests: the kite, the cloud and the goat.
   - The campfire night and winter time-lapse, then spring, the farewell, the keepsake and the departure.
6. **Travel.**
   - A steerable raft with rocks and rapids, and docks.
   - Kite updrafts back upstream.
   - The sky view on Tab or scroll, with fast travel.
7. **Small joys and sound.** Sitting on benches, flowers as gifts, petting goats, a whistle, birds, butterflies, a fox and fireflies. Footsteps by surface, voice blips, birds and crickets, and themes for each place.
8. **Quality.** Low, medium and high presets picked automatically from frame time. Save v2 with a gentle reset for old saves. Tests, scripted playtests and the design log.

## Key decisions
- **The story uses the drop.** The spring's last drop falls into Rill's lantern as he wakes, so the existing drop mechanics (glow and warmth) stay.
- **Ysolde moves to the village bench.** The first stranger is then on the natural path down from the spring. Her stones stay in the side valley under a small glacier tongue, which no longer covers the polar spring.
- **Tor is now a boy.** The snow poles stay as a small optional discovery. Fences need Tor's know-how, given through conversation. Ice towers need Bram's permission, or an apology.
- **Winter waits until the valley is ready.** Resting only triggers winter once the projected snowpack reaches the healed level, so the chapter can't be soft-locked by a wasted winter.
- **The departure ride is slow on purpose.** It runs from the bridge (lat 72) to the edge, about 70 seconds. Raft speed elsewhere is gentler too, so rafting feels like a moment.
- **The kite is in the main path.** Tor's farewell gift guarantees it, and his side quest grants it earlier, so going back is always possible after Chapter One.
