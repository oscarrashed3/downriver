// Just enough of a 2D canvas for the procedural textures to be built outside a browser.
const fn: any = new Proxy(function () {}, {
  get: (_t, k) => (k === 'data' ? new Uint8ClampedArray(4 * 1024 * 1024) : fn),
  apply: () => fn,
  set: () => true,
});
(globalThis as any).document ??= { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fn }) };
