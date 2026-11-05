// Character line-up: everyone in Chapter One standing in a row, for checking against Oscar's sheets.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => {
    const g = __game, p = g.planets[0], T = window.THREE;
    g.day.setLocal(p.dirRiver(57, -18), 0.5);
    const center = p.dirRiver(57.5, -17.5);
    const up = center.clone().normalize();
    const fwd = p.surfacePoint(p.dirRiver(54, -17.5)).sub(p.surfacePoint(center)).projectOnPlane(up).normalize();
    const side = new T.Vector3().crossVectors(up, fwd).normalize();
    const ids = ['ysolde','bram','nima','tor','odo'];
    const npcs = g.contents[0].npcs;
    ids.forEach((id, i) => {
      const n = npcs.find(x => x.id === id); if (!n) return;
      const d = p.surfacePoint(center).addScaledVector(side, (i - 2) * 1.3);
      const dir = d.clone().sub(p.center).normalize();
      n.place(p.surfacePoint(dir), dir, fwd.clone().negate());
      n.homePos.copy(n.root.position);
    });
    g.player.placeAt(p, p.surfacePoint(center).addScaledVector(side, 3.9).sub(p.center).normalize());
    g.player.facing.copy(fwd.clone().negate());
    g.player.sync();
    const camPos = p.surfacePoint(center).addScaledVector(fwd, -5.2).addScaledVector(up, 1.4).addScaledVector(side, 0.6);
    g.cutCam = { pos: camPos, look: p.surfacePoint(center).addScaledVector(up, 0.8).addScaledVector(side, 0.6), up };
    g.mode = 'cut';
  })()`);
  await page.waitForTimeout(3000); await shot('lineup');
  await ev(`(() => { const g = __game, p = g.planets[0]; const pl = g.player; const up = pl.up; g.cutCam = { pos: pl.pos.clone().addScaledVector(pl.facing, 1.9).addScaledVector(up, 1.0), look: pl.pos.clone().addScaledVector(up, 0.75), up }; })()`);
  await page.waitForTimeout(1500); await shot('nilo-front');
  await ev(`(() => { const g = __game; const pl = g.player; const up = pl.up; const side = new window.THREE.Vector3().crossVectors(up, pl.facing); g.cutCam = { pos: pl.pos.clone().addScaledVector(side, 1.9).addScaledVector(up, 1.0).addScaledVector(pl.facing, -0.3), look: pl.pos.clone().addScaledVector(up, 0.75), up }; })()`);
  await page.waitForTimeout(1500); await shot('nilo-side');
};
