export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  await ev(`(() => { const g = __game; g.player.hasDrop = true; g.flags.add('has-drop'); const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(40.2, 11.5)); g.rig.snap(); })()`);
  await page.waitForTimeout(1500);
  await shot('near');
  await key('KeyE'); await page.waitForTimeout(600);
  // hold space through lines; choose open cards
  await page.keyboard.down('Space');
  let shots = 0;
  for (let round = 0; round < 400; round++) {
    const st = await ev(`(() => { const s = __game.conv?.step(); return s ? s.kind : 'none'; })()`);
    if (st === 'none' || st === 'end') break;
    if (st === 'cards') { await page.waitForTimeout(300); if (shots++ < 1) await shot('cards'); await key('Digit1'); await page.waitForTimeout(300); continue; }
    if (round === 6) await shot('line');
    await page.waitForTimeout(250);
  }
  await page.keyboard.up('Space');
  await page.waitForTimeout(800); await shot('after');
  console.log(await ev(`JSON.stringify({ flags: [...__game.flags], mood: __game.moods.ysolde })`));
  await ev(`__game.skyread.active = true`); await page.waitForTimeout(2000); await shot('skyreading');
  await key('KeyM'); await page.waitForTimeout(1200); await shot('map'); await key('KeyM');
  await key('KeyJ'); await page.waitForTimeout(800); await shot('journal'); await key('KeyJ');
};
