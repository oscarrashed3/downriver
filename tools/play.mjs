// Scripted playtest: node tools/play.mjs <scenario> ; writes shots/<scenario>-N.png
import pw from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pw;
const scenario = process.argv[2] ?? 'start';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', m => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
if (process.env.Q) await page.addInitScript(q => localStorage.setItem('downriver-quality', q), process.env.Q);
if (process.env.FRESH) await page.addInitScript(() => { if (!sessionStorage.getItem('f')) { localStorage.removeItem('downriver-save-v2'); sessionStorage.setItem('f', '1'); } });
await page.goto((process.env.URL ?? 'http://localhost:5173/downriver/') + '?fast');
await page.waitForTimeout(9000);
let n = 0;
const shot = async (label) => { await page.screenshot({ path: `shots/${scenario}-${++n}-${label}.png` }); };
const ev = (js) => page.evaluate(js);
const key = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const steps = {
  async start() {
    await shot('title');
    await page.click('button[data-a="new"]');
    await page.waitForTimeout(1500); await shot('story');
    for (let i = 0; i < 5; i++) { await key('Space'); await page.waitForTimeout(400); }
    await page.waitForTimeout(2500); await shot('arrive');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
    await page.waitForTimeout(500); await shot('walk');
  },
};
await (steps[scenario] ?? (async () => { const s = await import(`./scen-${scenario}.mjs`); await s.default({ page, shot, ev, key }); }))();
const fps = await ev('window.__game && Math.round(window.__game.fps)');
console.log('fps', fps);
console.log([...new Set(logs)].filter(l => !l.includes('useProgram')).slice(0, 40).join('\n').slice(0, 6000));
await browser.close();
