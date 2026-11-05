# Design log

## 2026-11-05 · Milestone 1

**Engine: web (Three.js + TypeScript), not Godot.** Chosen with Oscar so every build is playable from a link, and so the builder can play-test it directly with screenshots. Revisit if the game outgrows the browser.

**Worlds are tiny planets.** Gravity points to each world's center; the river runs from the north pole (where it arrives) to the south pole (where it leaves). Worlds hang in a slow descending spiral, so the falling stream from one world's south pole arcs down into the next world's north pole. From the exit you can see the next world overhead with the stream rising into it, which makes "the river is always there" literal: you can see where you are going.

**The sky follows your local up.** Because you can walk upside down relative to the cosmos, the sky gradient, cloud sea and stars are computed relative to the traveler's up, so every spot looks like a normal evening sky.

**Warmth instead of a stamina meter.** Climbing steep slopes dims the drop in your lantern and frosts the edges of the screen; resting brings it back. There is no bar.

**Conversation is a held breath.** Hold Space while someone speaks. Letting go mid-line is interrupting (trust drops). Some lines end in silence; staying present through it reveals what they actually wanted to say. Cards are open, leading or judging questions; Apologize appears only when your own actions hurt someone (building ice towers without asking Bram takes his meadow's winter water).

**Two solutions to the Spring Peaks puzzle.** Snow fences only work on windward ridges, so Skyreading is how you know where to build (two decoy sites in sheltered hollows barely help). Ice towers work near the spring without Skyreading but borrow Bram's winter water. Mixing works too. Tested in `tests/systems.test.ts`.

**Visible ripple.** Snowpack sets the spring's flow; flow sets river width and color in all six worlds and the thickness of every falling stream. The glacier color, snowline and a new carved stone show the change in the Peaks itself.

**Originality check.** No names, characters, creatures, items or layouts from existing games. Tiny walkable planets are a general idea; we avoided anything distinctive from other games (no stars, no hats, no stamina wheel, no triangle relics).

### Ten weakest things right now (next pass)
1. Terrain is smooth but plain; ridges need painted rock bands and more silhouette variety.
2. Characters are simple cones; they need idle animations and gestures for body language.
3. The other five worlds are sketches: Keeper lines only, no puzzles yet.
4. No touch controls yet.
5. Rain and snow particles are simple dots.
6. The cloud sea is puffs plus sky gradient; a real volumetric layer would sell the scale.
7. Map relief is generated, not hand-inked.
8. Music is generative and pleasant but not yet composed per moment.
9. No settings menu (volume, mouse sensitivity, reduced motion).
10. Only English so far; text is all in data files ready for French, Spanish and German.
