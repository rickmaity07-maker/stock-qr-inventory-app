import { expect, test } from '@playwright/test';
import { FAKE_CAMERA_FILE } from './support/global-setup';

// A fake camera that keeps showing the Apple 20W charger's sticker (sample product prod-3).
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FAKE_CAMERA_FILE}`],
  },
  permissions: ['camera'],
});
test.skip(({ browserName }) => browserName !== 'chromium', 'fake camera needs Chromium');

const stockOf = (page: any, id: string) =>
  page.evaluate((pid: string) => JSON.parse(localStorage.getItem('@stockqr_products_v4_mobile_only') || '[]').find((p: any) => p.id === pid)?.quantity, id);

test('one sticker in front of the camera is one sale, and the camera stays light', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // fully offline: decoder must be bundled
  await page.addInitScript(() => {
    (window as any).__canvases = 0;
    const create = document.createElement.bind(document);
    (document as any).createElement = (tag: string, o?: any) => {
      if (String(tag).toLowerCase() === 'canvas') (window as any).__canvases++;
      return create(tag, o);
    };
  });
  await page.goto('app/');
  const confirm = page.getByText('Confirm sale');
  await expect(confirm).toBeVisible({ timeout: 15_000 }); // camera scanned the sticker
  const before = await stockOf(page, 'prod-3');
  await confirm.click();
  await expect(confirm).toBeHidden();

  // The sticker stays in view for 6 seconds: the sale sheet must not come back by itself.
  await page.waitForTimeout(6000);
  await expect(confirm).toBeHidden();
  expect(await stockOf(page, 'prod-3')).toBe(before - 1);

  // The scanner reuses one canvas instead of creating new ones several times a second.
  expect(await page.evaluate(() => (window as any).__canvases)).toBeLessThanOrEqual(2);

  // Tapping the product still sells it again on purpose.
  await page.getByRole('button', { name: /^Apple 20W/ }).click();
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).toBeHidden();
  expect(await stockOf(page, 'prod-3')).toBe(before - 2);
});
