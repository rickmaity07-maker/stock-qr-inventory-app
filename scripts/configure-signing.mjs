/**
 * CI helper: after `expo prebuild`, signs release APKs with your own key when the
 * ANDROID_KEYSTORE_BASE64 secret is set. Without it the build keeps Expo's default
 * (debug) key, so existing installs can still update.
 *
 * IMPORTANT: switching keys means phones must uninstall the old app once
 * (back up first: Settings → Data → Back up inventory, or pair another phone).
 *
 * Secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 */
import fs from 'node:fs';
import path from 'node:path';

const { ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD } = process.env;
if (!ANDROID_KEYSTORE_BASE64) {
  console.log('No release keystore secret set — keeping the default signing key.');
  process.exit(0);
}
for (const [k, v] of Object.entries({ ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD })) {
  if (!v) {
    console.error(`${k} is missing; set all four signing secrets.`);
    process.exit(1);
  }
}

const appDir = path.join(process.cwd(), 'android', 'app');
fs.writeFileSync(path.join(appDir, 'release.keystore'), Buffer.from(ANDROID_KEYSTORE_BASE64, 'base64'));

const gradlePath = path.join(appDir, 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const releaseConfig = `
        release {
            storeFile file('release.keystore')
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }`;
if (!gradle.includes("storeFile file('release.keystore')")) {
  gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${releaseConfig}`);
}
// In the release buildType, use the release signing config instead of debug
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
  '$1signingConfig signingConfigs.release'
);
fs.writeFileSync(gradlePath, gradle);
console.log('Release APKs will be signed with the provided keystore.');
