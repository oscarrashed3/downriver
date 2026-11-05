// The naturalist's notebook. Learning appears here as wonder, never as a quiz.
// Every science claim here is listed in docs/FACT_SHEET.md for expert review.

export interface JournalEntry { id: string; title: string; text: string; sketch: (c: CanvasRenderingContext2D) => void }

const ink = '#4a3a2a';
const line = (c: CanvasRenderingContext2D, pts: number[][], w = 2) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineWidth = w; c.strokeStyle = ink; c.stroke(); };

export const JOURNAL: Record<string, JournalEntry> = {
  'first-drop': {
    id: 'first-drop', title: 'Every trickle starts as snow',
    text: 'I followed the river up to where it begins. There is no tap, no hole in the ground: just snow and ice letting go of their water, drop by drop.',
    sketch: c => { line(c, [[10, 70], [40, 30], [60, 45], [85, 15], [110, 70]]); line(c, [[60, 70], [62, 80], [58, 88]], 3); c.fillStyle = '#9fd3ff'; c.beginPath(); c.arc(60, 60, 5, 0, 7); c.fill(); },
  },
  'snow-jar': {
    id: 'snow-jar', title: "The mountain's water jar",
    text: "Ysolde says snow is a jar. Winter fills it; summer pours it out slowly, which is why the river still runs in August. A smaller jar means a thinner river, all the way down.",
    sketch: c => { line(c, [[35, 20], [30, 80], [90, 80], [85, 20]]); c.fillStyle = '#dff0ff'; c.fillRect(33, 50, 54, 29); line(c, [[85, 70], [105, 76], [112, 88]], 2); },
  },
  'poles': {
    id: 'poles', title: 'What the poles say',
    text: "Tor's three poles all tell the same story. The old paint marks show where the snow reached in his first winters. Today it stops far lower. One number is weather. Forty years of numbers is a trend.",
    sketch: c => { [62, 54, 47, 40, 33, 28].forEach((v, i) => { c.fillStyle = i === 5 ? '#c4524a' : '#8aa0c8'; c.fillRect(12 + i * 17, 85 - v, 12, v); }); line(c, [[8, 86], [114, 86]], 1); },
  },
  'wind-loading': {
    id: 'wind-loading', title: 'Wind moves snow',
    text: 'Wind scoops snow off one side of a ridge and drops it on the other. That sheltered side grows heavy and can slide. It is the same reason a fence on the windy side catches snow: it makes the wind let go of it.',
    sketch: c => { line(c, [[10, 80], [60, 30], [110, 80]]); for (let i = 0; i < 4; i++) line(c, [[8, 30 + i * 8], [45, 28 + i * 6]], 1); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(78, 50, 18, 7, 0.8, 0, 7); c.fill(); c.strokeStyle = ink; c.stroke(); },
  },
  'cloud': {
    id: 'cloud', title: 'A cloud is water that has not landed yet',
    text: 'I caught a cloud in a bottle and let it go over the dry meadow. It rained. The sea makes clouds, clouds make snow, snow makes the river, the river returns to the sea. A circle.',
    sketch: c => { c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.arc(60, 45, 30, 0.3, Math.PI * 1.9); c.stroke(); line(c, [[86, 28], [92, 36], [84, 38]]); c.fillStyle = '#fff'; c.beginPath(); c.arc(45, 40, 9, 0, 7); c.arc(57, 36, 11, 0, 7); c.arc(69, 41, 8, 0, 7); c.fill(); },
  },
  'fences': {
    id: 'fences', title: 'Fences that catch snow',
    text: 'Built on the windward ridges, the fences slow the wind so it drops the snow it carries. In the sheltered hollows they did almost nothing. Where you build matters more than how much you build.',
    sketch: c => { for (let i = 0; i < 5; i++) line(c, [[20 + i * 20, 80], [20 + i * 20, 50]], 3); line(c, [[15, 58], [105, 58]], 2); line(c, [[15, 70], [105, 70]], 2); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(70, 82, 45, 9, 0, 0, 7); c.fill(); },
  },
  'stupas': {
    id: 'stupas', title: 'Towers of ice',
    text: 'Winter water piped up and sprayed into the cold freezes into tall cones. Their shape keeps them in their own shade, so they melt late, in spring, just when fields and rivers need water most. Real villages in high mountains build these.',
    sketch: c => { line(c, [[30, 85], [60, 15], [90, 85]], 2); c.fillStyle = '#dff0ff'; c.beginPath(); c.moveTo(32, 84); c.lineTo(60, 18); c.lineTo(88, 84); c.fill(); line(c, [[60, 15], [60, 5]], 2); },
  },
  'stone-returns': {
    id: 'stone-returns', title: 'The ice came back',
    text: 'This winter Ysolde carved her stone farther down the valley than last year: the ice came back toward her door. The first time in her life. The river below runs fuller, and I can see it from here, all the way to the next world.',
    sketch: c => { [70, 62, 55, 48, 42, 52].forEach((h, i) => { c.fillStyle = i === 5 ? '#9fd3ff' : '#8e8aa8'; c.fillRect(14 + i * 17, 88 - h * 0.9, 10, h * 0.9); }); },
  },
};
