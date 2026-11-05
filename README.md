# Downriver

A journey game about one river. A small traveler, Rill, carries the last drop of a fading spring across six small round worlds floating in a sea of clouds, all the way to the sea. The map is drawn only by the people you truly connect with, and each world heals once you understand how it works.

**Play:** https://oscarrashed3.github.io/downriver/ (laptop, keyboard and mouse; headphones recommended)

## Controls

| Key | Action |
| --- | --- |
| W A S D | walk (Shift to run) |
| Mouse | look (click the world to capture the mouse, Esc to release) |
| Space | jump; in conversation, **hold** to listen |
| E | talk, use, unfold Fold into a raft, step off the raft |
| Q | Skyreading, once Ysolde teaches you |
| M / J | your earned map / your journal |
| H / N | help / sound on or off |

## Milestone 1

- **The journey sketch:** all six worlds (Spring Peaks, Ember Pines, Green Deep, Glass Desert, Aquila, Endless Sea), each with its palette, landmark and Keeper, joined by the river. Ride the falling stream from one world to the next, and at the sea's lighthouse close the loop back to the spring.
- **The Spring Peaks, all out:** take the last drop, earn the map from Ysolde, Bram, Nima and Tor, learn Skyreading, and help the mountain hold its snow (snow fences on windward ridges, or ice towers, or both). Rest by the fire to let winter pass and watch the river widen in every world below. Side quests: Tor's snow poles, Bram's avalanche road, Nima's cloud in a bottle.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/downriver/
npm test         # system tests (snowpack puzzle, ripple, conversations)
npm run build    # static site in dist/
```

Made with Three.js and TypeScript. Every model, sound and line of text is original and generated in code.

See `docs/DESIGN_LOG.md` for design decisions and `docs/FACT_SHEET.md` for the science claims awaiting expert review.
