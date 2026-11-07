// The send-off at the end of chapter 1: the boat leaves the bridge, the lanterns go up, the wide shot, then the raft
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game; for (const f of ['peaks-healed', 'boat-ready', 'power:kite']) g.give(f); const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(74.6, -2.8)); g.rig.snap(); g.cut(g.ch1.farewell().slice(-4)); })()`);
  for (let k = 0; k < 9; k++) { await page.waitForTimeout(2600); await shot('bye-' + k); }
  console.log('end', await ev(`JSON.stringify({ mode: __game.mode, done: __game.flags.has('chapter1-complete') })`));
};
