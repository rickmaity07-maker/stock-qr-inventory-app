# Stock & QR Inventory (Android · iPhone home-screen app)

One codebase (React Native + Expo SDK 52) that runs as:

- **Android app** — APK built by GitHub Actions on every push to `main`.
- **iPhone / browser app** — installable from Safari ("Add to Home Screen"), works offline.
  Live at `https://rickmaity07-maker.github.io/stock-qr-inventory-app/app/` once `docs/app` is pushed.

## What it does

- **Scan** — Sell / Restock / Info modes. Selling more than is in stock is blocked; double taps can't record a sale twice.
- **Products** — catalogue with search, categories, unique QR code per product, single-label and A4-sheet printing, factory-barcode linking.
- **Stock** — low-stock reorder list (printable supplier order), expiry tracker, stock value.
- **Profit** (owner only) — monthly revenue, gross profit, margin, best/slowest sellers, PDF and CSV exports. Prices are stored with each sale, so past months never change.
- **Settings** — cloud account (sign in, sync status, change password, sign out), currency, backup/restore, updates, client preview lock.
- Apple Human Interface styling with automatic dark mode.

## Cloud account & backend

Each phone signs in to the shop's owner account (Settings → Cloud account). Every signed-in phone and the
iPhone web app share the same products, stock and sales. Selling works offline; changes upload automatically.

- **API:** `server/` — Hono on Vercel (`https://stock-qr-api.vercel.app/api`), Neon Postgres (Frankfurt).
- **First sign-in:** creates the single owner account and needs the one-time `SETUP_KEY` (Vercel env).
- **Forgot password:** `cd server && npm run set-password -- you@example.com "new password"` (signs out all devices).
- **Endpoints:** `/health`, `/auth/{status,setup,login,me,password,logout-all}`, `/sync`, `/products`,
  `/transactions`, `/reports/monthly?month=YYYY-MM&tz=Europe/Berlin`, `/reports/stock`, `/export`.
- **Deploy the API:** `npx vercel deploy server --prod` (env: `DATABASE_URL`, `JWT_SECRET`, `SETUP_KEY`, `ALLOWED_ORIGINS`).
- **Schema changes:** edit `server/db/schema.sql`, then `cd server && npm run migrate` (safe to re-run).
- **Tests:** `cd server && npm test` (runs against an in-process Postgres).

## Install on iPhone

1. Open the web app link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen, then sign in with the owner account (Settings → Cloud account).

The iPhone version scans QR stickers with the camera. Factory barcodes (EAN/UPC) can be picked from the list instead.

## Develop

```powershell
npm install --legacy-peer-deps
npx expo start            # press a for Android, w for web
npm test                  # unit + integration tests (Jest)
npm run typecheck         # TypeScript
npm run build:web         # builds the iPhone web app into docs/app
npm run test:e2e          # clicks through the built web app (Playwright)
npm run serve:web         # try docs/ locally at http://127.0.0.1:4180/stock-qr-inventory-app/app/
```

Code layout:

- `src/logic/inventoryLogic.ts` — pure rules (stock maths, sync merging, code matching, reports). Fully unit-tested in `__tests__/`.
- `src/context/InventoryContext.tsx` — app state and actions.
- `src/sync/useSyncEngine.ts` — sync with the cloud API.
- `src/services/` — storage, backup, API client.
- `server/` — backend API and database schema.
- `src/logic/money.ts` — currency.
- `src/ui/` — iOS-style components, theme tokens, crash screen.
- `src/screens/` — the five screens.
- `tests/e2e/` — browser tests of the iPhone web app.

## Releasing

1. Bump `version` (and `android.versionCode`) in `app.json`, and `version` + `notes` in `docs/live-update.json`.
2. `npm run build:web` and commit `docs/app`.
3. Push to `main`. GitHub Actions runs the checks, builds both APKs and publishes release `vX.Y.Z`.
   Installed phones see the update under Settings → Check for updates; the iPhone app updates itself on the next launch.

### Signing with your own key (recommended once)

Without secrets, APKs use Expo's default key — fine for side-loading, and existing installs keep updating.
To sign with your own key, create one and add four repository secrets:

```powershell
keytool -genkeypair -v -keystore stockqr.keystore -alias stockqr -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("stockqr.keystore")) | Set-Clipboard   # → ANDROID_KEYSTORE_BASE64
```

`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (stockqr), `ANDROID_KEY_PASSWORD`.
Keep the keystore file safe — losing it means users must reinstall. Switching keys requires phones to uninstall the old app once,
so back up first (Settings → Data → Back up inventory) or keep another phone signed in.

## Privacy

Inventory is stored on the phone and, when signed in, in the shop's own Neon database via the API
(HTTPS only, owner sign-in required, passwords stored as bcrypt hashes). Nothing is sent anywhere else.
