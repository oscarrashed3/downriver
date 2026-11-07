// The falling stream: the lip where the river leaves world 1, the fall from the side, and where it lands in world 2
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const views = [
    ['lip', `const e = P[P.length - 1], b = P[P.length - 40]; const up = e.clone(); const back = b.clone().sub(e).normalize(); const side = new V(0,0,0).crossVectors(up, back).normalize();
      return { pos: p.surfacePoint(b, 4).addScaledVector(side, 6), look: p.center.clone().addScaledVector(e, p.R + 0.5).addScaledVector(up, 3), up };`],
    ['lip-side', `const e = P[P.length - 1], b = P[P.length - 10]; const up = e.clone(); const fw = e.clone().sub(b).normalize(); const side = new V(0,0,0).crossVectors(up, fw).normalize();
      const at = p.center.clone().addScaledVector(e, p.R); return { pos: at.clone().addScaledVector(side, 18).addScaledVector(up, 6).addScaledVector(fw, -4), look: at.clone().addScaledVector(up, 6).addScaledVector(fw, 4), up };`],
    ['fall', `const c = g.streamCurve(0); const m = c.getPointAt(0.3), t = c.getTangentAt(0.3); const side = new V(0,0,0).crossVectors(t, new V(1,0,0)).normalize();
      return { pos: m.clone().addScaledVector(side, 30), look: m, up: t.clone().negate() };`],
  ];
  for (const [k, js] of views) {
    await ev(`(() => { const g = __game, p = g.planets[0], P = p.path, V = p.center.constructor; g.player.placeAt(p, P[P.length - 30]); g.cutCam = (() => { ${js} })(); g.mode = 'play'; })()`);
    await page.waitForTimeout(3000); await shot('stream-' + k);
  }
};
