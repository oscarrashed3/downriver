// Title framing: renders the title at a few poses (TUNES="a0,r,h,lookK,side;...") or, without TUNES, the default at 0, 30 and 60 s.
export default async ({ shot, ev }) => {
  const step = async (sec) => ev(`(() => { const g = __game; const n = ${Math.max(1, Math.round(sec / 0.05))}; g.renderEvery = n; for (let i = 0; i < n; i++) g.frame(); g.renderEvery = 1; })()`);
  await ev(`(() => { const g = __game; g.filming = true; g.fixedDt = 0.05; })()`);
  const tunes = (process.env.TUNES ?? '').split(';').filter(Boolean);
  if (!tunes.length) { for (const t of [0, 30, 60]) { await step(t ? 30 : 0.05); await shot('t' + t); } return; }
  for (const [i, t] of tunes.entries()) { await ev(`__game.titleTune = [${t}]`); await step(0.1); await shot('tune' + i); }
};
