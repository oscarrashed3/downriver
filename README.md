# Downriver

A journey game about one river. Rill wakes far from home at the top of the world, with a paper boat and a letter: *Follow the water. It always finds its way home.* Far below the clouds a single light blinks. Each of the six small round worlds the river crosses is a chapter of his life, and the people he meets there help him on his way. The map is drawn only by the people you truly connect with, and each world heals once you understand how it works.

**Play:** https://oscarrashed3.github.io/downriver/ (laptop, keyboard and mouse; headphones recommended)

## Controls

| Key | Action |
| --- | --- |
| W A S D | walk (Shift to run) |
| Mouse | look (click the world to capture the mouse, Esc to release; or hold the right button and drag) |
| Space | jump, and hold to glide once you have the kite; in conversation, **hold** to listen |
| E | talk, use, sit, pick, board Fold; hold E at echo stones and with the runaway goat |
| Q | Skyreading, once Ysolde teaches you |
| F | whistle |
| Tab or scroll out | see all the worlds from the sky; click a world you have visited to fly there (with the kite) |
| M / J / G | your earned map / your journal / hide the goal line |
| P / N / H | picture quality / sound / help |

## Chapter One: Where the Water Begins

- **The opening:** the title drifts over the cloud sea with all six worlds and the blinking home light. Rill wakes by the almost dry spring, reads the letter, looks down to the home light, and the journal opens on one quest: go home.
- **The Spring Peaks, rebuilt:** Hearth village, Kite Ridge, the goat terraces, Cloud Meadow, the old bridge and five echo stones. Ysolde, Tor, Bram, Nima and Odo each have an arc. Learn Skyreading, help the valley keep its snow, sit through a campfire night of stories while winter passes in a few breaths, then say goodbye at the bridge and ride the raft to the edge of the world.
- **Side quests:** Tor's kite (Fold learns to be a kite), Nima's cloud, Bram's runaway goat, the echo stones, Grandpa's snow poles.
- **Travel both ways:** raft from the bridge, falling streams down, warm updrafts back up by kite, and a sky view that shows every world at once with fast travel.
- **The look:** painted toon shading with blue-violet shadows and rim light, ink outlines, wind grass, painted cumulus with cloud shadows, a twelve minute day with a moon, and colors named in `src/render/palette.ts`.

The other five worlds are still sketches from Milestone 1.

## Milestone 1

- **The journey sketch:** all six worlds (Spring Peaks, Ember Pines, Green Deep, Glass Desert, Aquila, Endless Sea), each with its palette, landmark and Keeper, joined by the river. Ride the falling stream from one world to the next, and at the sea's lighthouse close the loop back to the spring.
- **The Spring Peaks, all out:** take the last drop, earn the map from Ysolde, Bram, Nima and Tor, learn Skyreading, and help the mountain hold its snow (snow fences on windward ridges, or ice towers, or both). Rest by the fire to let winter pass and watch the river widen in every world below. Side quests: Tor's snow poles, Bram's avalanche road, Nima's cloud in a bottle.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/downriver/
npm test         # system tests (snowpack, ripple, conversations, quests, kite, save migration)
node tools/play.mjs ch1   # scripted playtest with screenshots in shots/ (needs the dev server)
npm run build    # static site in dist/
```

Made with Three.js and TypeScript. Every model, sound and line of text is original and generated in code.

See `docs/DESIGN_LOG.md` for design decisions and `docs/FACT_SHEET.md` for the science claims awaiting expert review.
