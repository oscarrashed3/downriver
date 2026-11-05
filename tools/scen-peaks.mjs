// Full Spring Peaks loop: drop, Ysolde, Nima/cloud, Tor/poles, stupa without asking, Bram apology, fences, winter, Ysolde again.
export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  const tp = (lat, lon) => ev(`(() => { const g = __game; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.snap(); })()`);
  const prompt = () => ev(`document.querySelector('.prompt').innerText`);
  const talk = async (choices) => {
    await key('KeyE'); await page.waitForTimeout(500);
    await page.keyboard.down('Space');
    let ci = 0;
    for (let r = 0; r < 300; r++) {
      const st = await ev(`(() => { const s = __game.conv?.step(); return s ? s.kind : 'none'; })()`);
      if (st === 'none' || st === 'end') break;
      if (st === 'cards') { await key('Digit' + (choices[ci++] ?? 1)); await page.waitForTimeout(250); continue; }
      await page.waitForTimeout(200);
    }
    await page.keyboard.up('Space'); await page.waitForTimeout(400);
  };
  const act = async (label) => { const p = await prompt(); console.log(label, '->', JSON.stringify(p)); await key('KeyE'); await page.waitForTimeout(700); };

  await tp(15.5, 1); await page.waitForTimeout(800); await act('spring');
  await tp(40.2, 11.5); await page.waitForTimeout(600); await talk([1, 2]);   // learn fences + stupas
  await tp(58.6, -21.5); await page.waitForTimeout(600); await talk([1]);     // Nima
  await tp(40, 76); await page.waitForTimeout(800); await act('wisp');
  await tp(69, -41); await page.waitForTimeout(800); await act('meadow'); await page.waitForTimeout(1500); await shot('rain');
  await tp(76, 16); await page.waitForTimeout(600); await talk([1]);          // Tor
  for (const [la, lo] of [[46, -36], [72, 38], [98, -26]]) { await tp(la, lo); await page.waitForTimeout(700); await act('pole'); }
  await tp(19, -9); await page.waitForTimeout(700); await act('stupa-west');
  await tp(19, 9); await page.waitForTimeout(700); await act('stupa-east'); await shot('stupas');
  await tp(63.4, -23); await page.waitForTimeout(600); await talk([1, 1, 1, 1]); // Bram: apologize first
  await tp(30, -38); await page.waitForTimeout(700); await act('fence north');
  console.log(await ev(`JSON.stringify({ proj: __game.snow.sites.filter(s=>s.built).map(s=>s.id), journal: __game.journal, bram: __game.moods.bram })`));
  await tp(60.5, -15.5); await page.waitForTimeout(700); await act('fire');
  for (let i = 0; i < 30 && (await ev('__game.mode')) !== 'play'; i++) { if ((await ev('__game.mode')) === 'story') { await page.waitForTimeout(500); await shot('winter'); await key('Space', 120); } await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  console.log(await ev(`JSON.stringify({ snow: __game.snow.snowpack, flow: __game.river.flow, healed: __game.flags.has('peaks-healed'), journal: __game.journal })`));
  await tp(30, 10); await page.waitForTimeout(2500); await shot('healed-valley');
  await tp(40.2, 11.5); await page.waitForTimeout(600); await talk([1]);
  console.log(await ev(`JSON.stringify({ journal: __game.journal })`));
  await key('KeyJ'); await page.waitForTimeout(1200); await shot('journal'); await key('KeyJ', 300);
};
