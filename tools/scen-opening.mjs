// The first minutes: title, waking, the letter, "Look down", the chapter card, first steps.
export default async ({ page, shot, ev, key }) => {
  await shot('title');
  await page.click('button[data-a="new"]');
  await page.waitForTimeout(1200); await shot('wake');
  for (let i = 0; i < 30 && (await ev('__game.mode')) !== 'play'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(400); await shot('awake');
  console.log('prompt', await ev(`document.querySelector('.prompt').innerText`));
  await key('KeyE'); await page.waitForTimeout(800); await shot('letter');
  await key('KeyE'); await page.waitForTimeout(900); await shot('lookdown');
  await page.waitForTimeout(1500); await shot('homelight');
  for (let i = 0; i < 40 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(300); if (i === 8) await shot('chapter'); }
  await page.waitForTimeout(500); await shot('play');
  console.log('goal', await ev(`document.querySelector('.goal').innerText`));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  await shot('walk');
  console.log(await ev(`JSON.stringify({ mode: __game.mode, grass: __game.grass.total, visible: __game.grass.chunks.filter(c => c.mesh.visible).reduce((a, c) => a + c.mesh.geometry.instanceCount, 0), q: __game.quality.level, day: __game.day.t.toFixed(3) })`));
};
