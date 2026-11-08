// The long night in play (autopilot): sit, the others walk in, five logs, the winter, the tune, Hollo wakes.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game; ['quest:hollo','kite-flown','stones-done','ember-delivered','quest:night','invited:ysolde','invited:bram','invited:nima','invited:tor','invited:odo','gathered'].forEach(f => g.give(f)); g.ch1.restore(); g.renderEvery = 2; g.timeScale = ${process.env.TS ?? 2}; g.seq.speed = ${process.env.SEQ ?? 2}; g.ch1.night.autopilot = true; g.ch1.night.start(); })()`);
  let last = '', n = 0;
  for (let k = 0; k < 400; k++) {
    await page.waitForTimeout(700);
    const st = await ev(`JSON.stringify({ ph: __game.ch1.night.phase, mode: __game.mode, logs: __game.ch1.night.logsIn, lvl: +__game.ch1.night.level.toFixed(2) })`);
    if (st !== last) { console.log(k, st); last = st; }
    const s = JSON.parse(st);
    if (k % 6 === 0 || (s.ph === 'wake' && k % 2 === 0)) await shot(`${s.ph}-${++n}`);
    if (s.ph === 'off' && s.mode === 'play') break;
  }
  await shot('after');
  console.log('end', await ev(`JSON.stringify({ healed: __game.flags.has('peaks-healed'), winter: __game.winter })`));
};
