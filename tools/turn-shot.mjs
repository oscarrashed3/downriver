// node tools/turn-shot.mjs out.png [query]
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [out, query = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
pg.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
pg.on('pageerror', e => console.log('PAGEERR', e.message));
await pg.goto('http://localhost:5180/downriver/turnaround.html?' + query);
await pg.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 90000 });
await pg.screenshot({ path: out, timeout: 120000 });
await b.close();
