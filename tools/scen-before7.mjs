// Before/after helper: talk to Tor from a few metres away and take one shot once the first line shows.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game, V = g.player.pos.constructor; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id);
    for (const a of ['spring','village','terraces','ridge','meadow','cliffs','bridge','edge']) g.flags.add('area:' + a);
    const n = g.contents[0].npcs.find(x => x.id === 'tor'); const fwd = new V(0,0,1).applyQuaternion(n.root.quaternion).projectOnPlane(n.up).normalize(); const side = new V(1,0,0).projectOnPlane(n.up).normalize();
    const p = n.root.position.clone().addScaledVector(fwd, 2.0).addScaledVector(side, 1.2); g.player.placeAt(g.planet, p.sub(g.planet.center).normalize()); g.rig.snap(); g.mode = 'play'; g.input.pressed.add('KeyE'); })()`);
  for (let i = 0; i < 300 && !((await ev('__game.mode')) === 'talk' && (await ev('!__game.talkCam || __game.talkCam.open'))); i++) await page.waitForTimeout(100);
  await ev(`__game.input.down.add('Space')`);
  for (let i = 0; i < 300 && (await ev('__game.shownChars')) < 18; i++) await page.waitForTimeout(100);
  await ev(`__game.input.down.delete('Space')`);
  await page.waitForTimeout(800); await shot('tor');
};
