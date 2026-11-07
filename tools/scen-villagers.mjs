// Turnaround sheets and a lineup for the five villagers: ONLY=turn,lineup,walk node tools/play.mjs villagers
export default async ({ page, shot, ev }) => {
  const only = (process.env.ONLY ?? 'turn,lineup').split(',');
  const who = (process.env.WHO ?? 'ysolde,odo,bram,tor,nima').split(',');
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); window.V3 = g.player.pos.constructor; })()`);
  console.log('draw calls', await ev(`(() => { const out = {}; for (const n of __game.contents[0].npcs) { let m = 0; n.root.traverse(x => { if (x.isMesh && x.visible) m++; }); out[n.id] = m; } return JSON.stringify(out); })()`));
  // an open meadow away from everything
  await ev(`(() => { const g = __game; g.mode = 'play'; const p = g.planets[0]; let base = null;
    for (let la = 25; la < 150 && !base; la += 1.7) for (let lo = -90; lo < 90 && !base; lo += 1.7) { const a = p.dirRiver(la, lo); let ok = p.riverNearest(a).dist > 9 && p.slope(a) < 0.25;
      const w = p.surfacePoint(a); for (const s of p.solids) if (s.obj.position.distanceTo(w) < 12) { ok = false; break; } if (ok) base = a; }
    g.player.placeAt(p, base); const up = g.player.up.clone(); const f = new V3(0, 1, 0).projectOnPlane(up).normalize(), side = new V3().crossVectors(up, f).normalize();
    window.__s = { up, f, side, p, base: g.player.pos.clone() }; g.grass.update = () => {}; g.grass.group.visible = false; g.day.setLocal(up, 0.55, false);
    g.player.facing.copy(f); g.rig.faceDir(up, f); g.rig.snap(); })()`);
  await ev(`(() => { const c = document.querySelector('canvas'); const st = document.createElement('style'); st.textContent = '.zz-hide{visibility:hidden !important}'; document.head.appendChild(st);
    setInterval(() => { for (const el of document.body.querySelectorAll('*')) if (el !== c && !el.contains(c)) el.classList.add('zz-hide'); }, 200); })()`);
  const place = (js) => ev(`(() => { const g = __game, { up, f, side, p, base } = window.__s; ${js} })()`);
  if (only.includes('turn')) for (const id of who) {
    // front, side, back, three-quarter: four copies would cost a rebuild, so turn one and shoot four times
    for (const [k, ang] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI], ['three', -0.7]]) {
      await place(`const n = g.contents[0].npcs.find(n => n.id === '${id}'); const w = base.clone().addScaledVector(side, 3).addScaledVector(f, 2); const d = w.sub(p.center).normalize();
        const ff = f.clone().applyAxisAngle(up, ${ang}); n.place(p.surfacePoint(d, -0.05), d, ff); n.lookAt = null; n.pose = {}; n.talking = false;
        g.player.placeAt(p, base.clone().addScaledVector(side, -6).sub(p.center).normalize());
        const o = n.root.position.clone(); const hh = n.person.H * 1.75;
        g.contents[0].npcs.forEach((m, j) => { if (m !== n) m.place(p.surfacePoint(base.clone().addScaledVector(side, -20 - j * 2).sub(p.center).normalize(), -0.05), up, f); });
        g.cutCam = { pos: o.clone().addScaledVector(f, 0.6 + hh * 1.15).addScaledVector(up, hh * 0.55), look: o.clone().addScaledVector(up, hh * 0.5), up };
        n.update = ((orig) => function (dt, pp, wl) { orig.call(this, dt, null, wl); orientTo2(this, ff); })(n.constructor.prototype.update);
        function orientTo2(n, ff) { const m = new (g.camera.matrix.constructor)(); const x = new V3().crossVectors(up, ff).normalize(); m.makeBasis(x, up, ff); n.root.quaternion.setFromRotationMatrix(m); }`);
      await page.waitForTimeout(1600); await shot(`${id}-${k}`);
    }
    await place(`const n = g.contents[0].npcs.find(n => n.id === '${id}'); delete n.update;`);
  }
  if (only.includes('lineup')) {
    await place(`g.player.placeAt(p, base.clone().sub(p.center).normalize()); g.player.facing.copy(f); g.rig.faceDir(up, f); g.rig.snap(); const ids = ['ysolde', 'odo', 'bram', 'tor', 'nima'];
      ids.forEach((id, i) => { const n = g.contents[0].npcs.find(n => n.id === id); delete n.update; const w = base.clone().addScaledVector(side, (i + 1) * 1.3); const d = w.sub(p.center).normalize();
        n.place(p.surfacePoint(d, -0.05), d, f.clone()); n.lookAt = null; n.pose = {}; n.faceOverride = f.clone(); });
      const mid = base.clone().addScaledVector(side, 3.2);
      g.cutCam = { pos: mid.clone().addScaledVector(f, 6.2).addScaledVector(up, 1.6), look: mid.clone().addScaledVector(up, 0.85), up };`);
    await page.waitForTimeout(2500); await shot('lineup');
    await place(`g.cutCam = { pos: base.clone().addScaledVector(side, 3.6).addScaledVector(f, -7.5).addScaledVector(up, 1.6), look: base.clone().addScaledVector(side, 3.6).addScaledVector(up, 0.85), up };`);
    await page.waitForTimeout(1500); await shot('lineup-back');
  }
};
