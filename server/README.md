# Stock QR API — operations

Hono on Vercel (`stock-qr-api`) + Neon Postgres (`stock-qr-inventory`, Frankfurt).
Secrets live in `server/.env` (never committed), Vercel env vars, and GitHub secrets.

| Task | Command (in `server/`) |
|---|---|
| Run tests | `npm test` |
| Apply schema changes (safe to repeat) | `npm run migrate` |
| Deploy | `npx vercel deploy . --prod --yes` |
| Latest crash reports from phones and server | `npm run errors` (or `npm run errors -- 100`) |
| Owner forgot password | In the app: Settings → Sign in → **Forgot password?** (needs the setup key). Emergency: `npm run set-password -- you@example.com "new password"` |

## Backups

GitHub Actions → **Nightly cloud backup** runs every night at 02:30 UTC. It checks that the API is up,
then saves an encrypted copy of all products and sales. Copies are kept 90 days. If a run fails,
GitHub emails you.

To restore:

1. Open the run you want → **Artifacts** → download the zip and unzip the `.sqrb` file.
2. `npm run decrypt-backup -- StockQR-cloud-backup-YYYY-MM-DD.sqrb restored.json`
   (uses `BACKUP_PASSPHRASE` from `server/.env`; a copy is in `Desktop\StockQR-private-keys\secrets.txt`).
3. Send `restored.json` to a phone, then go to Settings → Data → **Restore from backup**.

Neon also keeps its own short history (point-in-time restore) in the Neon console.

## Android signing key

Release APKs are signed with the shop's own key (GitHub secrets `ANDROID_KEYSTORE_*`, `ANDROID_KEY_*`).
The original is in `Desktop\StockQR-private-keys\` (OneDrive). **Keep that folder; never commit it.**
If it is lost, future updates cannot install over the app (every phone would have to reinstall).
