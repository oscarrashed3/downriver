// Story check: the storm panels, waking beside Hollo, Ysolde at the spring, then jumps through the stops.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await page.waitForTimeout(2500); await shot('storm1');
  await page.waitForTimeout(4400); await shot("storm2");
  await page.waitForTimeout(5200); await shot('storm3');
  for (let i = 0; i < 80 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(800); await shot('awake-hollo');
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await page.waitForTimeout(800); await shot('goal');
  console.log('goal', await ev(`document.querySelector('.goal').innerText`));
  // jump to the long night
  await ev(`(() => { const g = __game; ['quest:hollo','kite-flown','fences-done','quest:night','invited:ysolde','invited:bram','invited:nima','invited:tor','invited:odo','gathered'].forEach(f => g.give(f)); g.ch1.restore(); })()`);
  await page.waitForTimeout(1200);
  console.log('goal2', await ev(`document.querySelector('.goal').innerText`));
  await ev(`(() => { const g = __game; g.seq.speed = 1; g.ch1.night.phase = 'wake'; g.cut(g.ch1.night.wakeBeats()); })()`);
  for (const [t, l] of [[4000, 'fire'], [6000, 'story'], [16000, 'snow'], [9000, 'eyes'], [6000, 'rise'], [6000, 'walk'], [6000, 'spring']]) { await page.waitForTimeout(t); await shot(l); }
  for (let i = 0; i < 80 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  console.log('flags', await ev(`JSON.stringify(['peaks-healed','journal:hollo'].map(f => __game.flags.has(f)))`));
  await ev(`(() => { const g = __game; g.give('boat-ready'); g.seq.speed = 1; g.cut(g.ch1.farewell()); })()`);
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) { await key('Space', 20); await page.waitForTimeout(700); }
  for (const [t, l] of [[2500, 'postman-fall'], [4000, 'postman-land'], [5000, 'letter']]) { await page.waitForTimeout(t); await shot(l); }
};
