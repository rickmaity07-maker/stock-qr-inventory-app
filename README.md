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
- **Settings** — owner PIN (stored hashed, 5 tries then a 30 s pause), staff mode, phone pairing, optional Supabase, updates, client preview lock.
- Apple Human Interface styling with automatic dark mode.

## Sync between phones

Each store gets its own private, random sync code. In **Settings → Show pairing code**, then scan that QR from the other phone's **Scan** tab.
Changes are shared within seconds through ntfy.sh; every phone keeps working offline and catches up later.
Stock is calculated from the sales and restocks themselves, so two phones selling the same item at once both count.

Optional: use your own Supabase project instead (Settings → Supabase). Run `supabase/schema.sql` in its SQL editor first — it is safe to re-run and upgrades older tables.

## Install on iPhone

1. Open the web app link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen, then pair it with the Android phone (Settings → Pair with another store, or scan the pairing QR).

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
- `src/sync/useSyncEngine.ts` — phone-to-phone and Supabase sync.
- `src/services/` — storage, backup, ntfy relay, Supabase.
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
so back up first (Settings → Data → Back up inventory) or keep another phone paired.

## Privacy

Inventory stays on the phone. With pairing on, changes are sent to ntfy.sh under the store's random code
(anyone holding the code can read them). With Supabase, data goes to your own project instead.
