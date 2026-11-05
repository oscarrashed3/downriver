export default async ({ page, ev }) => {
  await page.click('button[data-a="new"]');
  await page.waitForTimeout(3000);
  console.log(await ev(`(() => { const g = __game, c = g.ch1; const pt = c.at([74.8, -4.2]); const out = []; g.scene.traverse(o => { if (o.isMesh && o.visible) { const w = o.getWorldPosition(pt.clone()); if (w.distanceTo(pt) < 3.5) { let n = o, path = []; while (n && n !== g.scene) { path.push(n.name || n.type); n = n.parent; } out.push(o.geometry.type + ' ' + w.distanceTo(pt).toFixed(1) + ' ' + JSON.stringify(o.geometry.parameters || {}).slice(0, 80) + ' ' + path.slice(0, 4).join('<')); } } }); return out.join('\\n'); })()`));
};
