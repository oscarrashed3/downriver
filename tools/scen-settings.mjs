// Settings: the gear on the HUD, Esc opens Settings, the title screen's Settings button, and the page itself.
// Waits are in game time and clicks are forced, so a slow headless frame rate does not trip it up.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  const log = [];
  const push = x => { log.push(x); console.log(JSON.stringify(x)); };
  /** Wait until the game has run `s` seconds of its own time (at least a few frames). */
  const wait = async (s) => { const t0 = await ev('__game.time'); for (let i = 0; i < 240 && (await ev('__game.time')) - t0 < s; i++) await page.waitForTimeout(150); };
  const click = async (sel) => { await page.click(sel, { force: true, timeout: 120000 }); await wait(0.15); };
  const esc = async () => { await page.keyboard.down('Escape'); await wait(0.1); await page.keyboard.up('Escape'); await wait(0.1); };
  await ev(`__game.renderEvery = 1`);
  await shot('title');
  if (await page.$('.title button[data-a="settings"]')) {
    await click('.title button[data-a="settings"]'); await page.waitForTimeout(1200);
    push(['title settings', await mode(), await ev(`document.querySelector('.settings.ontitle') !== null`)]);
    await shot('title-settings');
    await esc(); await page.waitForTimeout(1000);
    push(['title esc', await mode(), await ev(`!document.querySelector('.settings') || document.querySelector('.settings').closest('.overlay').classList.contains('hidden')`)]);
  }
  await click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game, p = g.planets[0]; g.player.placeAt(p, p.dirRiver(61.5, -19.5)); g.rig.snap(); })()`);
  await wait(3);
  if (await page.$('.gearbtn')) { await page.hover('.gearbtn', { force: true, timeout: 120000 }); await page.waitForTimeout(900); }
  await shot('hud');
  await esc(); await page.waitForTimeout(800);
  push(['Esc', await mode(), await ev('__game.overlay')]);
  await shot('settings');
  if (await page.$('.settings [data-q="medium"]')) {
    await click('.settings [data-q="medium"]');
    await page.$eval('#set-sens', r => { r.value = '75'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#set-dist', r => { r.value = '20'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('.settings [data-a="mute"]');
    push(['changed', await ev(`[__game.quality.level, __game.quality.manual, +__game.rig.sens.toFixed(2), +__game.rig.distGoal.toFixed(2), __game.sound.muted, localStorage.getItem('downriver-sens')]`)]);
    await page.waitForTimeout(600);
    await shot('settings-changed');
    await click('.settings [data-a="mute"]');
    await click('.settings [data-q="auto"]');
    push(['auto', await ev(`[__game.quality.level, __game.quality.manual, localStorage.getItem('downriver-quality')]`)]);
    await click('.settings [data-q="high"]');
    await click('.settings [data-a="reset"]');
    push(['reset once', await ev(`document.querySelector('.settings [data-a="reset"]').textContent`), await mode()]);
  }
  await esc();
  push(['Esc again', await mode(), await ev('__game.overlay')]);
  if (await page.$('.gearbtn')) {
    await click('.gearbtn');
    push(['gear', await mode(), await ev('__game.overlay')]);
    await click('.gearbtn');
    push(['gear again', await mode(), await ev('__game.overlay')]);
  }
  await click('.menubtn');
  push(['boat', await mode(), await ev('__game.overlay')]);
  await esc();
  push(['boat Esc', await mode(), await ev('__game.overlay')]);
  // The browser letting go of the mouse (Esc while looking around) also opens Settings, and its late Esc does not shut it.
  await ev(`(() => { __game.input.lockLost = true; })()`); await wait(0.1);
  push(['lock lost', await mode(), await ev('__game.overlay')]);
  await page.keyboard.down('Escape'); await page.keyboard.up('Escape'); await wait(0.05);
  push(['late Esc', await mode(), await ev('__game.overlay')]);
  await wait(0.5); await esc();
  push(['Esc later', await mode(), await ev('__game.overlay')]);
  // The × on the sheet and a click on the dim space around it both close it.
  await click('.gearbtn');
  push(['gear for x', await mode(), await ev('__game.overlay')]);
  await click('.settings .sx');
  push(['sheet x', await mode(), await ev('__game.overlay')]);
  await click('.gearbtn');
  await page.mouse.click(40, 600); await wait(0.15);
  push(['backdrop', await mode(), await ev('__game.overlay')]);
  // On the raft: Esc opens Settings, the raft waits, and closing goes back to the raft.
  await ev(`__game.boardRaft()`); await wait(1);
  const t0 = await ev('__game.player.raftT');
  await esc();
  push(['raft Esc', await mode(), await ev('__game.overlay'), await ev('__game.onRaft'), await ev(`!document.querySelector('.gearbtn').classList.contains('hidden')`)]);
  await wait(1.5);
  push(['raft paused', (await ev('__game.player.raftT')) === (await ev('__game.player.raftT')), +(await ev('__game.player.raftT') - t0).toFixed(5)]);
  await shot('raft-settings');
  await esc();
  push(['raft Esc close', await mode(), await ev('__game.overlay')]);
  await wait(1);
  push(['raft moves again', +(await ev('__game.player.raftT') - t0).toFixed(5)]);
  console.log(JSON.stringify(log));
};
