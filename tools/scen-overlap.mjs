// Counts solids that overlap each other and solids in the river on world 1 (used to check the planet size change)
export default async ({ ev }) => {
  console.log(await ev(`(() => { const p = __game.planets[0]; const S = p.solids; const rad = s => s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd) * 0.8;
    let over = [], wet = [];
    for (let i = 0; i < S.length; i++) { const a = S[i]; const d = a.obj.position.clone().sub(p.center).normalize(); const rn = p.riverNearest(d).dist;
      if (rn < p.cfg.riverWidth * 1.2 && !/rock|stone|bridge/.test(a.tag ?? a.obj.name ?? '')) wet.push((a.tag ?? '?') + ' ' + rn.toFixed(1));
      for (let j = i + 1; j < S.length; j++) { const b = S[j]; const g = a.obj.position.distanceTo(b.obj.position) - rad(a) - rad(b); if (g < -0.6) over.push((a.tag ?? '?') + '/' + (b.tag ?? '?') + ' ' + g.toFixed(1)); } }
    return 'R ' + p.R + ' solids ' + S.length + ' overlaps ' + over.length + ': ' + over.slice(0, 40).join(', ') + ' | near river ' + wet.length + ': ' + wet.slice(0, 20).join(', '); })()`));
};
