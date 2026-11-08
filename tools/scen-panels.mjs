// The three opening story pictures, saved straight from their canvases as they come up
import fs from 'fs';
export default async ({ page, ev }) => {
  await page.click('button[data-a="new"]');
  const seen = new Set();
  for (let k = 0; k < 120 && seen.size < 3; k++) {
    const url = await ev(`(() => { const c = document.querySelector('.kpanel .frame canvas'); return c ? c.toDataURL('image/jpeg', 0.9) : null; })()`);
    if (url && !seen.has(url.length)) { seen.add(url.length); fs.writeFileSync(`shots/panel-${seen.size - 1}.jpg`, Buffer.from(url.split(',')[1], 'base64')); }
    await page.waitForTimeout(400);
  }
};
