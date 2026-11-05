// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [jsBeforeShot]
import pw from '/opt/node-tools/node_modules/playwright/index.js';
const [url, out, wait = '6000', js = ''] = process.argv.slice(2);
const { chromium } = pw; const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (js) { await page.evaluate(js); await page.waitForTimeout(2500); }
await page.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
