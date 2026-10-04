/* QR codes for ambassador links and posters, made in the browser by the vendored qrcode-generator (vendor/qrcode.js, MIT, Kazuhiko Arase). */
import qrcode from './vendor/qrcode.js';

/** text → rows of booleans (true = dark). Level M still scans on a scuffed or badly printed poster. */
export function qrMatrix(text, level = 'M') {
  const q = qrcode(0, level); q.addData(String(text)); q.make();
  const n = q.getModuleCount(), m = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
  return m;
}
/** A crisp SVG (one path) with the quiet zone scanners need around it. */
export function qrSvg(text, { size = 220, quiet = 4, dark = '#2B1D17', light = '#FFFFFF', label = '' } = {}) {
  const m = qrMatrix(text), n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  const al = String(label).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${al}"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
