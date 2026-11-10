// Sky Isles phase 3: the story frame (arrival splash + parade, Lark, the goal beam, the postman's balloon, Sailtown's people).
//   VW=1600 VH=900 node tools/play.mjs sky-story      (SKYSHOTS=dir, ONLY=1,3 for some shots)
import { mkdirSync } from 'fs';

export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase3';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`); await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]', { timeout: 600000 });
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game, p = g.planets[1]; g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; g.saveOff = true; })()`);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.includes(String(n));
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; window.__noon = () => g.day.setLocal(g.player.up, 0.5); })()`);
  const run = async (ms) => { const n = Math.max(1, Math.round(ms / 50)); await ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = i === ${n} - 1 ? 1 : 100000; __noon(); g.frame(); } g.renderEvery = 1; })()`); };
  const beat = () => ev('__game.seq.running ? __game.seq.i : -1');
  const toBeat = async (b, extra = 0) => { for (let i = 0; i < 400 && (await beat()) < b && (await beat()) !== -1; i++) await run(100); if (extra) await run(extra); };

  // the arrival
  await ev(`__game.ch2.arrive()`);
  await toBeat(2, 5000);
  if (want(1)) await snap('1-kites-tilt');
  await toBeat(3, 3500);
  if (want(2)) await snap('2-whales');
  await toBeat(4, 6000);
  if (want(3)) await snap('3-wide');
  await toBeat(7, 1500);
  if (want(4)) await snap('4-lark-herald');
  for (let i = 0; i < 300 && (await beat()) !== -1; i++) { await ev(`__game.input.pressed.add('Space')`); await run(300); }
  console.log('after arrival', await ev(`JSON.stringify({ mode: __game.mode, arrived: __game.flags.has('sky:arrived'), goal: __game.worldTask(), meter: __game.ch2.meter() })`));

  // the goal line and the beam over Lark, seen from Landing Isle
  if (want(5)) {
    await ev(`(() => { const g = __game, p = g.planets[1], c = g.ch2; g.player.placeAt(p, c.dir([26, 5])); const to = c.npc('lark').root.position.clone().sub(g.player.pos).projectOnPlane(g.player.up).normalize(); g.player.facing.copy(to); g.rig.faceDir(g.player.up, to); g.rig.smoothUp.copy(g.player.up); g.rig.snap(); })()`);
    await run(2500);
    await snap('5-goal-beam');
  }
  // Sailtown's people: Lark, Gran Wren, Zephy and the crowd by the gate
  if (want(6)) {
    await ev(`(() => { const g = __game, c = g.ch2; for (const n of g.contents[1].npcs) g.flags.add('met:' + n.id); const a = c.at([60.5, 4], 0); g.player.placeAt(g.planets[1], c.dir([60.5, 4])); const look = c.npc('granwren').root.position.clone(); const up = a.clone().sub(g.planets[1].center).normalize();
      g.rig.override = { pos: a.clone().addScaledVector(up, 3.2).add(a.clone().sub(look).projectOnPlane(up).normalize().multiplyScalar(3)), look: look.clone().addScaledVector(up, 1.2), up }; })()`);
    await run(1500);
    await snap('6-sailtown-people');
    await ev('__game.rig.override = null');
  }
  // the postman's balloon in Sailtown square
  if (want(7)) {
    await ev(`(() => { const g = __game, c = g.ch2; g.flags.add('sky:quest-kite'); g.player.placeAt(g.planets[1], c.dir([57.5, 6])); g.rig.snap(); })()`);
    await run(600);
    await toBeat(1, 2000);
    await snap('7-postman-balloon');
    await toBeat(3, 2500);
    await snap('8-letter');
    for (let i = 0; i < 100 && (await beat()) !== -1; i++) await run(500);
    console.log('letter', await ev(`JSON.stringify({ l2: __game.flags.has('letter:2'), goal: __game.worldTask(), meter: __game.ch2.meter() })`));
  }
};
