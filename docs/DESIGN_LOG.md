# Design log

## 2026-11-05 · Chapter One: Where the Water Begins

**The story frame.** Rill is far from home and making his way back. Each world is a chapter of his life; the tone is gentle and hopeful, closer to a fable than an adventure. One main quest ("Go home, to the light below the clouds") is shown as a single next step in the corner, never a list. The home light is the lighthouse on the Endless Sea, a real light you can see from the opening and from the sky view.

**The first three minutes are scripted, then hands-off.** Title over the cloud sea, five quiet seconds of waking, the letter, "Look down", the chapter card, one beat of the journal. Everything after that is walking. All words live in `src/data/story.ts` and `src/data/scripts.ts`.

**Quests are a pure chain.** `src/story/quests.ts` computes the current step from flags, so it can be tested without a browser. Side quests are listed the same way. People only repeat their short "after" lines when nothing they care about has changed since you last spoke (a signature of the flags their script reacts to).

**Winter only when it would work.** The campfire night unlocks once the snow you have helped keep would heal the valley (projected snowpack at least 0.7), so you never sit through a winter that changes nothing. The time-lapse is a scene, not a menu.

**The kite is guaranteed.** Tor's kite side quest teaches Fold to be a kite; if you skipped it, Tor gives the kite at the farewell anyway, because going back up the river depends on it.

**Travel both ways.** Raft down from Odo's bridge (steerable, rocks spin you, you never fail), falling streams between worlds, warm updrafts back up by kite, and the sky view (Tab or scroll out) with fast travel to any world you have visited. Progress lives in one set of flags, so going back finds everything as you left it.

**The look.** Toon shading is patched with a shared "paint" shader: ambient light follows each world's local up, shadows lean blue-violet, a warm rim light, slow cloud shadows, and painted color variation. Ink outlines are inverted hulls. Grass is GPU-instanced tufts with wind and player push, around 85,000 blades in view near the player at high quality. A twelve minute day with a moon; sitting on a bench speeds time up. Colors are named in `src/render/palette.ts`.

**Performance.** Quality (low, medium, high) is picked from the frame-time median while you play and only steps down; P picks one by hand and is remembered. The whole game is one small JavaScript bundle with no downloaded assets.

**Saves.** Version 2. A Milestone 1 save is gently reset with a notice, since it belongs to a different story. Tested in `tests/chapter1.test.ts`.

### Ten weakest things right now (next pass)
1. Faces and hands are still simple shapes; expressions read at conversation distance but not in close-ups.
2. The kite flight with Tor is short and mostly camera; it deserves a moment where you hold the string yourself.
3. Paths and the village shelf are flat color; they want painted stones, puddles and wear.
4. Cloud shadows and painted clouds don't yet agree, so the sky can look busier than the ground.
5. The campfire winter time-lapse changes snow and light, but nobody moves; villagers should shift, nap, pull up blankets.
6. Echo stones are discovered only by wandering; they need a faint sound you can follow.
7. Footstep and ambient sounds are synthesized and thin; place themes are generative, not composed.
8. Scene cameras are hand-placed orbits and can still clip a roof or a tree in odd spots.
9. The other five worlds are Milestone 1 sketches, now visibly rougher than the Peaks.
10. No touch or gamepad controls, and no settings screen beyond quality and mute.

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
