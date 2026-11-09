// Screenshots of a Sky Isles lab piece: node tools/skylab-shot.mjs <piece> <out-dir> [view,view] [seconds] [extra query]
// Needs the dev server (npm run dev). Renders each named view (or all) after `seconds` of simulated time.
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs';
const { chromium } = pw;
const [piece = 'whale', out = 'shots/skylab', viewsArg = '', secs = '2', extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = Number(process.env.W ?? 1600), H = Number(process.env.H ?? 900);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const base = process.env.URL ?? 'http://localhost:5173/downriver/';
await page.goto(`${base}skylab.html?piece=${piece}&still&w=${W}&h=${H}&t=${secs}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__ready && window.__frames > 2, null, { timeout: 180000 }).catch(() => {});
const views = viewsArg ? viewsArg.split(',') : await page.evaluate(() => window.__views ?? []);
for (const v of views) {
  await page.evaluate(v => window.__view(v), v);
  await page.waitForFunction(n => window.__frames > n + 2, await page.evaluate(() => window.__frames), { timeout: 120000 });
  const f = `${out}/${piece}-${v}.png`;
  await page.screenshot({ path: f, timeout: 120000 });
  console.log('wrote', f);
}
console.log(logs.filter(l => !l.includes('useProgram')).slice(0, 30).join('\n'));
await browser.close();
