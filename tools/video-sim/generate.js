// Renders the CCTV-style sample clips to ../../static-mvp/media/*.mp4 (needs playwright + ffmpeg).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const FPS = 24, SCENES = (process.argv[2] ? process.argv[2].split(',') : ['road', 'plaza', 'port', 'promenade', 'terminal']);
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 700, height: 420 } });
  await p.goto('file://' + path.join(__dirname, 'scenes.html'));
  const T = await p.evaluate(() => window.T), out = path.join(__dirname, '..', '..', 'static-mvp', 'media'); fs.mkdirSync(out, { recursive: true });
  for (const s of SCENES) {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'frames-')); const n = T * FPS;
    for (let f = 0; f < n; f++) { const url = await p.evaluate(([s, t, f]) => window.draw(s, t, f), [s, f / FPS, f]); fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64')); }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(out, s + '.mp4')]);
    fs.rmSync(dir, { recursive: true, force: true }); console.log('wrote', s + '.mp4', (fs.statSync(path.join(out, s + '.mp4')).size / 1024).toFixed(0) + ' KB');
  }
  await b.close();
})();
