// Screenshots of a Walking Town lab piece: node tools/townlab-shot.mjs <piece> <out-dir> [view,view] [seconds] [extra query]
// Needs the dev server (npm run dev). Renders each named view (or all) after `seconds` of simulated time, and
// prints the renderer's draw calls and triangles for each (the whole frame: shadow pass, scene, post passes).
// ADV=0.4,0.4 takes more shots of each view after simulating that many more seconds each (for a walk cycle).
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs';
const { chromium } = pw;
const [piece = 'amble', out = 'shots/townlab', viewsArg = '', secs = '3', extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = Number(process.env.W ?? 1600), H = Number(process.env.H ?? 900);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const base = process.env.URL ?? 'http://localhost:5173/downriver/';
await page.goto(`${base}townlab.html?piece=${piece}&still&w=${W}&h=${H}&t=${secs}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__ready && window.__frames > 2, null, { timeout: 240000 }).catch(() => {});
const views = viewsArg ? viewsArg.split(',') : await page.evaluate(() => window.__views ?? []);
const tag = process.env.TAG ? `-${process.env.TAG}` : '';
for (const v of views) {
  await page.evaluate(v => window.__view(v), v);
  await page.waitForFunction(n => window.__frames > n + 2, await page.evaluate(() => window.__frames), { timeout: 180000 });
  const f = `${out}/${piece}-${v}${tag}.png`;
  await page.screenshot({ path: f, timeout: 180000 });
  console.log('wrote', f, JSON.stringify(await page.evaluate(() => window.__info)));
  let k = 0;
  for (const a of (process.env.ADV ? process.env.ADV.split(',').map(Number) : [])) {
    await page.evaluate(a => window.__advance(a), a);
    await page.evaluate(v => window.__view(v), v);
    await page.waitForFunction(n => window.__frames > n + 2, await page.evaluate(() => window.__frames), { timeout: 180000 });
    const g = `${out}/${piece}-${v}${tag}-${++k}.png`;
    await page.screenshot({ path: g, timeout: 180000 });
    console.log('wrote', g);
  }
}
console.log(logs.filter(l => !l.includes('useProgram')).slice(0, 30).join('\n'));
await browser.close();
