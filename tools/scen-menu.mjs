// The top-right menu: open it with the mouse, click through every tab, close by clicking outside.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  // Partway through world 1: one lantern lit, Bram next, a letter and a sketch to show.
  await ev(`(() => { const g = __game, p = g.planets[0];
    ['talked:ysolde', 'quest:hollo', 'journal:snow-jar', 'map:valley', 'talked:tor', 'quest:kite', 'item:spar', 'kite-flown', 'power:skyreading', 'quest:markers', 'quest:cloud'].forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(61.5, -19.5)); g.rig.snap(); })()`);
  await page.waitForTimeout(5000);
  await shot('button');
  const log = [];
  await page.click('.menubtn'); await page.waitForTimeout(1500);
  log.push(['button', await ev('__game.mode'), await ev('__game.overlay')]);
  await shot('goal');
  for (const t of ['map', 'bag', 'letters', 'sketches', 'journal', 'controls', 'settings']) {
    await page.click(`.menustrip [data-t="${t}"]`); await page.waitForTimeout(1500);
    log.push([t, await ev('__game.overlay')]);
    await shot(t);
  }
  // Clicking the dim space outside the sheet closes the menu.
  await page.mouse.click(30, 400); await page.waitForTimeout(800);
  log.push(['outside', await ev('__game.mode'), await ev('__game.overlay')]);
  // Keys still work, Esc opens the goal, the same key closes.
  await key('KeyM'); await page.waitForTimeout(500); log.push(['M', await ev('__game.overlay')]);
  await key('KeyM'); await page.waitForTimeout(500); log.push(['M again', await ev('__game.overlay')]);
  await key('Escape'); await page.waitForTimeout(500); log.push(['Esc', await ev('__game.overlay')]);
  await key('Escape'); await page.waitForTimeout(500); log.push(['Esc again', await ev('__game.overlay'), await ev('__game.mode')]);
  console.log(JSON.stringify(log));
};
