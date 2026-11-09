// Hollo wakes on its own: straight into the wake beats at night by the fire.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game; ['quest:hollo','kite-flown','stones-done','ember-delivered','quest:night','invited:ysolde','invited:bram','invited:nima','invited:tor','invited:odo','gathered'].forEach(f => g.give(f)); g.ch1.restore(); g.renderEvery = 2;
    g.winter = 1; g.grass.snow = 1; g.applySnow(); const pl = g.player; g.player.placeAt(g.planets[0], g.planets[0].dirRiver(21.5, -7)); g.day.frozen = true; g.day.setLocal(pl.up, -0.2);
    g.ch1.night.phase = 'wake'; g.timeScale = ${process.env.TS ?? 1}; g.cut(g.ch1.night.wakeBeats()); })()`);
  for (let k = 0; k < 80 && (await ev('__game.mode')) === 'cut'; k++) {
    await page.waitForTimeout(1200);
    const cap = await ev(`(document.querySelector('.caption')?.innerText || '').slice(0, 40)`);
    console.log(k, await ev(`JSON.stringify({ t: +__game.seq.t?.toFixed?.(1), thaw: +(__game.ch1.night && 0), surge: __game.planets[0].waterMat.uniforms.uSurge.value | 0 })`), cap);
    await shot('w' + k);
  }
  await shot('after');
  console.log('end', await ev(`JSON.stringify({ mode: __game.mode, healed: __game.flags.has('peaks-healed'), winter: __game.winter })`));
};
