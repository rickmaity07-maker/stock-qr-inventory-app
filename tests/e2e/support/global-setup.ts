/** Creates a fake camera video (Y4M) that shows the sample charger's QR sticker. */
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode');

export const FAKE_CAMERA_FILE = path.resolve(__dirname, '..', '..', '..', 'test-results', 'fake-camera-qr.y4m');

export default function globalSetup() {
  const W = 640, H = 480, FRAMES = 30;
  const qr = QRCode.create('STK-AP20-1003', { errorCorrectionLevel: 'M' });
  const n: number = qr.modules.size, quiet = 4;
  const scale = Math.floor(360 / (n + quiet * 2));
  const size = (n + quiet * 2) * scale, ox = (W - size) / 2, oy = (H - size) / 2;
  const Y = Buffer.alloc(W * H, 60);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.floor(y / scale) - quiet, c = Math.floor(x / scale) - quiet;
      const dark = r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c);
      Y[(oy + y) * W + ox + x] = dark ? 16 : 235;
    }
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < FRAMES; f++) parts.push(Buffer.from('FRAME\n'), Y, UV, UV);
  fs.mkdirSync(path.dirname(FAKE_CAMERA_FILE), { recursive: true });
  fs.writeFileSync(FAKE_CAMERA_FILE, Buffer.concat(parts));
}
