import { expect, Page, test } from '@playwright/test';

const APP = 'app/';
const EXTERNAL = /ntfy\.sh|githubusercontent\.com|github\.io|jsdelivr\.net|stock-qr-api\.vercel\.app/;

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

  test('profit is visible to the owner and hidden in preview mode', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: /Profit/ }).click();
    await expect(page.getByText('Gross profit').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Settings' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByText('Lock this phone in preview mode').click();
    await page.getByRole('tab', { name: /Profit/ }).click();
    await expect(page.getByText('Owner only')).toBeVisible();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByLabel('Licence key', { exact: true }).fill('MOBILE-PRO-2026');
    page.once('dialog', (d) => d.accept());
    await page.getByText('Unlock', { exact: true }).last().click();
    await page.getByRole('tab', { name: /Profit/ }).click();
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

  test('signing in to the cloud account syncs the catalogue', async ({ page }) => {
    const pushed: any[] = [];
    await page.route(/ntfy\.sh|githubusercontent\.com|jsdelivr\.net/, (r) => r.abort());
    await page.route(/stock-qr-api\.vercel\.app\/api\/(.*)/, async (route) => {
      const url = route.request().url();
      const reply = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
      if (url.endsWith('/auth/status')) return reply({ hasOwner: true });
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(route.request().postData() || '{}');
        return body.password === 'right password' ? reply({ token: 'tok', email: body.email }) : reply({ error: 'Email or password is wrong.' }, 401);
      }
      if (url.endsWith('/sync')) {
        pushed.push(JSON.parse(route.request().postData() || '{}'));
        return reply({
          cursor: 3,
          hasMore: false,
          rejected: [],
          transactions: [],
          products: [{ id: 'cloud-1', name: 'Cloud Charger', category: 'Chargers', qrCode: 'STK-CLOU-0001', buyingPrice: 4, sellingPrice: 9.5, quantity: 6, openingQuantity: 6, minStockLevel: 1, updatedAt: '2026-10-30T10:00:00.000Z' }],
        });
      }
      return reply({ error: 'Not found' }, 404);
    });
    await page.goto(APP);
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByText('Sign in', { exact: true }).first().click();
    await page.getByLabel('Email', { exact: true }).fill('owner@shop.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong password');
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page.getByText('Email or password is wrong.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('right password');
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page.getByText('owner@shop.test')).toBeVisible();
    await page.getByRole('tab', { name: 'Products' }).click();
    await expect(page.getByText('Cloud Charger')).toBeVisible();
    await expect(page.getByText(/iPhone 16 Pro Max/)).toHaveCount(0); // sample data removed, never uploaded
    expect(pushed.every((b) => b.products.every((p: any) => !String(p.id).startsWith('prod-')))).toBe(true);
  });
});
