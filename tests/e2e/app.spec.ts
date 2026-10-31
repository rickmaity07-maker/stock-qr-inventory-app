import { expect, Page, test } from '@playwright/test';

const APP = 'app/';
const EXTERNAL = /ntfy\.sh|githubusercontent\.com|github\.io|jsdelivr\.net/;

/** Keep tests deterministic: no real sync relay or update server. */
async function offline(page: Page) {
  await page.route(EXTERNAL, (route) => route.abort());
}

async function storedProducts(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('@stockqr_products_v4_mobile_only') || '[]'));
}

async function open(page: Page) {
  await offline(page);
  await page.goto(APP);
  await expect(page.getByText('Scan', { exact: true }).first()).toBeVisible();
}

test.describe('iPhone web app', () => {
  test('first launch shows the sample catalogue on the Scan tab', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Or pick a product', { exact: false })).toBeVisible();
    await expect(page.getByText(/iPhone 16 Pro Max/).first()).toBeVisible();
    expect((await storedProducts(page)).length).toBe(8);
  });

  test('home-screen tags, manifest and icons are present', async ({ page, request }) => {
    await open(page);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const manifest = await (await request.get(`${APP}manifest.webmanifest`)).json();
    expect(manifest.display).toBe('standalone');
    expect((await request.get(`${APP}icons/apple-touch-icon.png`)).ok()).toBeTruthy();
    expect((await request.get(`${APP}sw.js`)).ok()).toBeTruthy();
  });

  test('tab bar icon font loads', async ({ page }) => {
    const fontResponses: number[] = [];
    page.on('response', (r) => {
      if (r.url().includes('Ionicons')) fontResponses.push(r.status());
    });
    await open(page);
    await page.waitForFunction(() => (document as any).fonts.check('24px ionicons'));
    expect(fontResponses).toContain(200);
    expect(fontResponses.every((s) => s === 200)).toBeTruthy();
  });

  test('selling lowers stock and cannot exceed what is in stock', async ({ page }) => {
    await open(page);
    await page.getByText(/Apple 20W USB-C Fast Power/).first().click();
    await expect(page.getByText('Confirm sale')).toBeVisible();
    // try to go above stock: the + button stops at the stock level
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Increase', exact: true }).click();
    const before = (await storedProducts(page)).find((p: any) => p.id === 'prod-3').quantity;
    await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(String(before));
    await page.getByRole('button', { name: 'Decrease' }).click();
    await page.getByText('Confirm sale').click();
    await expect(page.getByText(/Sold \d+ × Apple 20W/)).toBeVisible();
    const after = (await storedProducts(page)).find((p: any) => p.id === 'prod-3').quantity;
    expect(after).toBe(1);
  });

  test('data survives an offline relaunch (old data-wipe bug)', async ({ page }) => {
    await open(page);
    await page.getByText(/AirPods Pro/).first().click();
    await page.getByText('Confirm sale').click();
    const qty = (await storedProducts(page)).find((p: any) => p.id === 'prod-4').quantity;
    await page.reload();
    await expect(page.getByText(/AirPods Pro/).first()).toBeVisible();
    const again = (await storedProducts(page)).find((p: any) => p.id === 'prod-4').quantity;
    expect(again).toBe(qty);
  });

  test('adding a product validates the form and creates a QR code', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByText('Add product and create QR').click();
    await expect(page.getByText('Enter a product name')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Pixel 9 Pro Case');
    await page.getByLabel('Selling price', { exact: true }).fill('24.99');
    await page.getByLabel('Buying price', { exact: true }).fill('6');
    await page.getByLabel('Starting stock', { exact: true }).fill('12');
    await page.getByText('Add product and create QR').click();
    await expect(page.getByText(/STK-PIXE-[A-Z0-9]{4}/)).toBeVisible();
    const added = (await storedProducts(page)).find((p: any) => p.name === 'Pixel 9 Pro Case');
    expect(added.quantity).toBe(12);
  });

  test('deleting a product asks for confirmation on the web', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByText(/Braided 60W USB-C/).first().click();
    page.once('dialog', (d) => d.accept());
    await page.getByText('Delete product').click();
    await expect(page.getByText(/Braided 60W USB-C/)).toHaveCount(0);
    const stored = (await storedProducts(page)).find((p: any) => p.id === 'prod-8');
    expect(stored.deleted).toBe(true);
  });

  test('profit is hidden from staff and the PIN unlocks it', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByText('Switch to staff mode').click();
    await page.getByRole('tab', { name: /Profit/ }).click();
    await expect(page.getByText('Owner only')).toBeVisible();
    await page.getByLabel('Owner PIN', { exact: true }).fill('1234');
    await page.getByText('Unlock', { exact: true }).click();
    await expect(page.getByText('Gross profit').first()).toBeVisible();
  });

  test('currency setting changes prices everywhere', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByText('Currency').click();
    await page.getByText('Euro (€)').click();
    await page.getByRole('tab', { name: 'Scan' }).click();
    await expect(page.getByText(/€1[.,]149/).first()).toBeVisible();
  });

  test('old iPhone page redirects and its data is imported', async ({ page }) => {
    await offline(page);
    await page.goto('iphone-app.html');
    // seed the old page's storage key, then start the new app fresh
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        'stock_qr_mobile_only_ios_v5',
        JSON.stringify({
          products: [
            { id: 'p-old', name: 'Old Shop Item', category: 'Misc', qrCode: 'STK-OLDS-0001', buyingPrice: 2, sellingPrice: 5, quantity: 7, minStockLevel: 2 },
          ],
          transactions: [],
        })
      );
    });
    await page.goto('iphone-app.html');
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByText('Old Shop Item')).toBeVisible();
    const p = (await storedProducts(page)).find((x: any) => x.id === 'p-old');
    expect(p.quantity).toBe(7);
  });

  test('dark mode renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(0, 0, 0)');
  });
});
