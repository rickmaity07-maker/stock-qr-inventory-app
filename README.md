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
npm test                  # unit tests (Jest)
npm run typecheck         # TypeScript
npm run build:web         # builds the iPhone web app into docs/app
```

Code layout:

- `src/logic/inventoryLogic.ts` — pure rules (stock maths, sync merging, code matching, reports). Fully unit-tested in `__tests__/`.
- `src/context/InventoryContext.tsx` — app state, storage, sync.
- `src/services/` — ntfy relay and Supabase.
- `src/ui/` — iOS-style components and theme tokens.
- `app/(tabs)/` — the five screens.

## Releasing

Pushing to `main` runs the tests and builds both APKs (full and client-demo) into the `v1.0.0` GitHub release.
Bump `version` in `app.json` and in `docs/live-update.json` together so installed phones are offered the update.
