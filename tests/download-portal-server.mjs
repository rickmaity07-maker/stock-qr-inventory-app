import { createRequire } from 'module';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
let playwrightPkg;
try {
  playwrightPkg = require('playwright');
} catch {
  playwrightPkg = require(
    'C:\\Users\\zeeri\\OneDrive\\Desktop\\Projects\\completed\\almadina-store\\al-madina-store\\node_modules\\@playwright\\test'
  );
}
const { chromium } = playwrightPkg;

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function buildPortalHtml(lanUrl, localUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Download Stock & QR Inventory App (Android)</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 20% 20%, rgba(13,148,136,0.25), transparent 45%), #060A14;
      color: #F8FAFC;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .portal-card {
      max-width: 820px;
      width: 100%;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 28px;
      padding: 32px;
      box-shadow: 0 30px 70px rgba(0,0,0,0.7);
    }
    .badge {
      display: inline-block;
      background: rgba(20, 184, 166, 0.2);
      color: #2DD4BF;
      border: 1px solid rgba(45, 212, 191, 0.4);
      font-size: 11px;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 99px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    h1 { margin: 12px 0 6px; font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
    p.sub { color: #94A3B8; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .box {
      background: rgba(9, 14, 26, 0.85);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .box h3 { margin: 0 0 6px; font-size: 17px; color: #2DD4BF; }
    .box p { font-size: 12.5px; color: #CBD5E1; line-height: 1.5; margin: 0 0 16px; }
    .btn {
      display: inline-block;
      text-align: center;
      text-decoration: none;
      background: linear-gradient(135deg, #0D9488, #0F766E);
      color: #FFFFFF;
      font-weight: 800;
      font-size: 13.5px;
      padding: 13px 18px;
      border-radius: 99px;
      margin-bottom: 8px;
      box-shadow: 0 6px 18px rgba(13, 148, 136, 0.35);
    }
    .btn.secondary {
      background: #1E293B;
      border: 1px solid #334155;
      box-shadow: none;
    }
    .url-box {
      background: #050811;
      border: 1px solid #1E293B;
      border-radius: 10px;
      padding: 10px 12px;
      font-family: monospace;
      font-size: 13px;
      color: #38BDF8;
      margin-bottom: 12px;
      word-break: break-all;
    }
    code {
      display: block;
      background: #050811;
      padding: 10px;
      border-radius: 10px;
      font-family: monospace;
      font-size: 11.5px;
      color: #34D399;
      margin-top: 8px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="portal-card">
    <span class="badge">✓ Ready for Android & PC</span>
    <h1>Stock & QR Studio — Download & Install</h1>
    <p class="sub">Choose how you want to download or install the app onto your Android phone or PC right now:</p>

    <div class="grid">
      <div class="box">
        <div>
          <h3>1. Direct Download & Install (Instant)</h3>
          <p>Download the self-contained offline Android/Web app file directly, or open the live mobile app and tap <strong>"Add to Home Screen"</strong> in Chrome on Android.</p>
          <div class="url-box">Wi-Fi Phone Link: ${lanUrl}/app</div>
        </div>
        <div>
          <a class="btn" style="display:block;" href="/download-app">⬇ Download Standalone App (.html)</a>
          <a class="btn secondary" style="display:block;" href="/app">📱 Open Full-Screen Mobile App</a>
        </div>
      </div>

      <div class="box">
        <div>
          <h3>2. Native Android APK & Live Demo</h3>
          <p>Watch the interactive 12-step visual finger walkthrough, or build a standalone Android <code>.apk</code> installer from the Expo project folder:</p>
          <code>cd C:\\Users\\zeeri\\OneDrive\\Desktop\\stock-qr-inventory-app<br/>npm install<br/>npx eas-cli build -p android --profile preview</code>
        </div>
        <div style="margin-top:14px;">
          <a class="btn secondary" style="display:block;" href="/walkthrough?autostart=1">🎓 Open Live Physical Click Walkthrough</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function startDownloadPortal() {
  const port = 4200;
  const lanIp = getLocalLanIp();
  const lanUrl = `http://${lanIp}:${port}`;
  const localUrl = `http://127.0.0.1:${port}`;

  const mobileAppPath = path.join(projectRoot, 'dist', 'Stock-QR-Inventory-Android.html');
  const walkthroughPath = path.join(__dirname, 'android-emulator-harness.html');

  const server = http.createServer((req, res) => {
    const reqUrl = req.url || '/';

    if (reqUrl.startsWith('/download-app')) {
      const content = fs.readFileSync(mobileAppPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Stock-QR-Inventory-Android.html"',
      });
      res.end(content);
      return;
    }

    if (reqUrl.startsWith('/app')) {
      const content = fs.readFileSync(mobileAppPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    if (reqUrl.startsWith('/manifest.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'Stock & QR Inventory Studio',
          short_name: 'Stock & QR',
          start_url: '/app',
          display: 'standalone',
          background_color: '#090E1A',
          theme_color: '#0D9488',
        })
      );
      return;
    }

    if (reqUrl.startsWith('/walkthrough')) {
      const content = fs.readFileSync(walkthroughPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPortalHtml(lanUrl, localUrl));
  });

  await new Promise((resolve) => {
    server.listen(port, '0.0.0.0', resolve);
  });

  console.log(`Download Portal Live at: ${localUrl}`);
  console.log(`Android Phone Wi-Fi Link: ${lanUrl}/app`);
  console.log(`Direct Download Link: ${localUrl}/download-app`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=920,680', '--window-position=80,60'],
  });
  const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await context.newPage();
  await page.goto(localUrl, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();

  await new Promise((resolve) => {
    browser.on('disconnected', resolve);
  });
  process.exit(0);
}

startDownloadPortal().catch((err) => {
  console.error(err);
  process.exit(1);
});
