# Stock & QR Inventory App (Android • React Native / Expo)

Built from the **Stock & QR Inventory App — Feature Overview** specification.

## Quick Start on Your Android Phone

1. Open PowerShell and navigate to the project folder:
   ```powershell
   cd C:\Users\zeeri\OneDrive\Desktop\stock-qr-inventory-app
   npm install
   npx expo start
   ```
2. Scan the terminal QR code using the **Expo Go** app on your Android phone (or press `a` to launch on an Android Emulator).

---

## Included Features

### 1. Products & QR Codes (`app/(tabs)/products.tsx`)
- **Product Catalogue**: Add, edit, and remove products with name, category, buying price, selling price, stock quantity, minimum stock alert level, and optional expiry date.
- **Automatic QR Generation**: Every new product automatically receives a unique QR code (`STK-...`) — one code per product so all units of the same item share a sticker.
- **Label Printing (`src/utils/printAndExport.ts`)**: Print either a **Single Sticker** (formatted for Bluetooth thermal label printers) or a **Full A4 Sticker Sheet** of copies.
- **Existing Factory Barcodes**: Link an existing factory barcode (`EAN-13`, `UPC`, `Code128`) directly to a product so no extra sticker is needed.

### 2. Mistake-Proof Scanning (`app/(tabs)/index.tsx`)
- **3-Way Scanner Switch**: Clear color-coded **Sell (default)** / **Restock** / **Info** switch at the top of the scanner screen prevents restocks from being counted as sales.
- **Sell Mode**: Scan → confirm quantity (defaults to `1`) → stock decreases and sale is recorded.
- **Restock Mode**: Scan incoming goods → enter quantity, buying price, and optional expiry date → stock increases.
- **Info Mode**: Scan to inspect a product's details, live stock level, QR code, and recent sales history without modifying anything.

### 3. Stock Management (`app/(tabs)/stock.tsx`)
- **Live Stock Levels**: Always-current quantity for every product.
- **Low-Stock Alerts**: Automatic tab badge and warning pills when any product hits or drops below its minimum stock level.
- **Reorder List**: Automatic supplier reorder list of everything below its minimum threshold, with 1-tap **Print Supplier Order PDF** and **Quick Restock**.
- **Expiry Tracker**: Tracks perishable goods and highlights items expiring soon or already expired.

### 4. Revenue, Gross Profit & Accountant Exports (`app/(tabs)/dashboard.tsx`)
- **Monthly Revenue & Gross Profit**: Selling price minus buying price for every item sold in the selected month.
- **Accurate Historical Pricing**: `unitBuyingPrice` and `unitSellingPrice` are saved with every individual sale transaction, so changing a product's price today never alters past months' figures.
- **Dashboard**: Month-by-month comparison chart, best & worst sellers, and live inventory valuation (at cost and retail).
- **Report Export**: Download or share monthly reports as **PDF** or **Excel (CSV)**.

### 5. Users, Roles & Offline-First Live Sync (`app/(tabs)/settings.tsx`)
- **Owner vs. Staff Roles**: Owner sees everything including profit (default PIN: `1234`). Staff mode hides buying prices, revenue, and profit.
- **Works Offline + Live Sync**: Works 100% offline using `AsyncStorage` and syncs live across all Android devices via Supabase Realtime (`supabase/schema.sql`).
