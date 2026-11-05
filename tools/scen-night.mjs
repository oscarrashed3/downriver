// The long night and the postman, advanced by pressing Space; shots along the way.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 40`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 40; })()`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; ['quest:hollo','kite-flown','fences-done','quest:night','invited:ysolde','invited:bram','invited:nima','invited:tor','invited:odo','gathered'].forEach(f => g.give(f)); g.ch1.restore(); g.seq.speed = 1; g.cut(g.ch1.campfireNight()); })()`);
  const line = () => ev(`(document.querySelector('.caption')?.innerText || '').slice(0, 60)`);
  let last = '', n = 0;
  for (let i = 0; i < 90 && (await mode()) === 'cut'; i++) {
    await page.waitForTimeout(1500);
    const l = await line();
    if (l !== last) { last = l; await shot('n' + (++n)); console.log(n, l.replace(/\n/g, ' ')); }
    await key('Space', 20);
  }
  console.log('flags', await ev(`JSON.stringify(['peaks-healed','journal:hollo'].map(f => __game.flags.has(f)))`));
  await ev(`(() => { const g = __game; g.give('boat-ready'); g.seq.speed = 1; g.cut(g.ch1.farewell()); })()`);
  for (let i = 0; i < 90 && (await mode()) === 'cut'; i++) {
    await page.waitForTimeout(1500);
    const l = await line();
    if (l !== last || i % 4 === 0) { last = l; await shot('f' + (++n)); console.log(n, l.replace(/\n/g, ' ')); }
    await key('Space', 20);
  }
};
