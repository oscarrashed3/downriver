// Hollo wakes and comes apart into the clouds: steps the game by hand (0.05 s), a shot every SHOT s of game time
// from 'Hollo rises' on, then a few seconds of play and the look-up at his cloud from the spring.
export default async ({ page, shot, ev }) => {
  const SHOT = Number(process.env.SHOT ?? 0.7), STEP = 0.05;
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game; ['quest:hollo','kite-flown','stones-done','ember-delivered','quest:night','invited:ysolde','invited:bram','invited:nima','invited:tor','invited:odo','gathered'].forEach(f => g.give(f)); g.ch1.restore();
    g.winter = 1; g.grass.snow = 1; g.applySnow(); const pl = g.player; g.player.placeAt(g.planets[0], g.planets[0].dirRiver(21.5, -7)); g.day.frozen = true; g.day.setLocal(pl.up, -0.2);
    g.ch1.night.phase = 'wake'; g.filming = true; g.fixedDt = ${STEP}; g.renderEvery = 100000; g.cut(g.ch1.night.wakeBeats()); g.seq.speed = 1; })()`);
  const caption = () => ev(`(document.querySelector('.caption')?.innerText || '').slice(0, 50)`);
  const step = (n, draw) => ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = (${draw} && i === ${n} - 1) ? 1 : 100000; g.frame(); } return g.mode; })()`);
  // fast through the eyes, the thaw, the surge and the valley's answer
  for (let i = 0; i < 2000; i++) {
    const c = await caption();
    if (c.startsWith('Hollo rises')) break;
    await step(10, false);
  }
  const per = Math.round(SHOT / STEP);
  for (let k = 0; k < 60; k++) {
    const m = await step(per, true);
    console.log(k, (k * SHOT).toFixed(1), m, await caption());
    await shot('c' + String(k).padStart(2, '0'));
    if (m !== 'cut') break;
  }
  for (let k = 0; k < 4; k++) { await step(per, true); await shot('play' + k); }
  console.log('end', await ev(`JSON.stringify({ mode: __game.mode, healed: __game.flags.has('peaks-healed'), hollo: __game.ch1.hollo.root.visible, state: __game.ch1.holloCloud.state, solids: __game.planets[0].solids.filter(s => s.id?.startsWith('hollo')).map(s => s.id) })`));
  // stand where he slept and look up at him
  await ev(`(() => { const g = __game, p = g.planets[0]; g.player.placeAt(p, p.dirRiver(15.5, -2)); const it = g.contents[0].interactables.find(i => i.id === 'hollo'); console.log('prompt', it.label()); it.act(); g.seq.speed = 1; })()`);
  for (let k = 0; k < 7; k++) { await step(per, true); await shot('look' + k); }
  await shot('look-end');
};
