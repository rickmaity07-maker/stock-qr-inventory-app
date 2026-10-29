import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { MonthlySummary, Product } from '../types/inventory';
import { generateRealQrMatrix } from '../components/DesignerQrCode';

/**
 * Generates a 100% optically scannable ISO/IEC 18004 Reed-Solomon Designer QR Code SVG.
 * Works 100% offline and prints at crisp vector resolution on thermal or A4 sticker sheets.
 */
export function buildDesignerQrSvg(
  qrValue: string,
  sizePx: number = 120,
  primaryColor: string = '#0F172A',
  accentColor: string = '#0D9488'
): string {
  const matrix = generateRealQrMatrix(qrValue || 'STK-0000');
  const gridSize = 25;
  const quietZone = 3;
  const totalModules = gridSize + quietZone * 2;
  const cell = sizePx / totalModules;

  let rects = '';
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        const isFinderCenter =
          (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
          (r >= 2 && r <= 4 && c >= 20 && c <= 22) ||
          (r >= 20 && r <= 22 && c >= 2 && c <= 4);
        const fill = isFinderCenter ? accentColor : primaryColor;
        const x = ((c + quietZone) * cell).toFixed(2);
        const y = ((r + quietZone) * cell).toFixed(2);
        const w = (cell + 0.35).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${fill}" />`;
      }
    }
  }

  return `
    <svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
      <rect width="${sizePx}" height="${sizePx}" rx="${(sizePx * 0.08).toFixed(1)}" fill="#FFFFFF"/>
      ${rects}
    </svg>
  `;
}

/**
 * Prints either a Single Designer Label (for Bluetooth thermal printers) or an A4 Sticker Sheet (24 copies per sheet).
 */
export async function printProductQrLabels(
  product: Product,
  mode: 'SINGLE' | 'A4_SHEET',
  copiesCount: number = 24,
  _qrBase64Png?: string
): Promise<void> {
  const count = mode === 'SINGLE' ? 1 : Math.max(1, Math.min(60, copiesCount));
  const qrSize = mode === 'SINGLE' ? 140 : 88;
  const qrMarkup = buildDesignerQrSvg(product.qrCode, qrSize, '#0F172A', '#0D9488');

  const singleStickerHtml = `
    <div class="sticker">
      <div class="sticker-top-bar">
        <span class="cat-pill">${escapeHtml(product.category || 'STOCK')}</span>
        <span class="price-pill">£${product.sellingPrice.toFixed(2)}</span>
      </div>
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="qr-frame">${qrMarkup}</div>
      <div class="meta-footer">
        <span class="qr-code-text">${escapeHtml(product.qrCode)}</span>
        <span class="scan-badge">SCAN TO SELL</span>
      </div>
    </div>
  `;

  const stickersRepeater = Array.from({ length: count })
    .map(() => singleStickerHtml)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Designer QR Labels - ${escapeHtml(product.name)}</title>
        <style>
          @page {
            margin: ${mode === 'SINGLE' ? '4mm' : '10mm'};
          }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 0;
            color: #0F172A;
            background: #FFFFFF;
          }
          .sheet-header {
            display: ${mode === 'SINGLE' ? 'none' : 'flex'};
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0F172A;
            padding-bottom: 8px;
            margin-bottom: 12px;
            font-size: 11px;
            color: #334155;
          }
          .grid {
            display: ${mode === 'SINGLE' ? 'block' : 'grid'};
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          .sticker {
            border: 1.5px solid #CBD5E1;
            border-radius: 14px;
            padding: ${mode === 'SINGLE' ? '14px' : '10px'};
            text-align: center;
            page-break-inside: avoid;
            max-width: ${mode === 'SINGLE' ? '230px' : 'none'};
            margin: ${mode === 'SINGLE' ? '0 auto' : '0'};
            background: linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%);
            box-shadow: inset 0 1px 0 #FFFFFF;
          }
          .sticker-top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          }
          .cat-pill {
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #0D9488;
            background: #F0FDFA;
            border: 1px solid #99F6E4;
            padding: 2px 6px;
            border-radius: 99px;
          }
          .price-pill {
            font-size: ${mode === 'SINGLE' ? '15px' : '12px'};
            font-weight: 900;
            color: #FFFFFF;
            background: #0F172A;
            padding: 2px 8px;
            border-radius: 99px;
          }
          .product-name {
            font-size: ${mode === 'SINGLE' ? '13px' : '11px'};
            font-weight: 800;
            line-height: 1.25;
            height: 28px;
            overflow: hidden;
            margin-bottom: 6px;
            color: #0F172A;
          }
          .qr-frame {
            padding: 6px;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            display: inline-block;
            margin: 2px auto;
          }
          .meta-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 6px;
            padding-top: 5px;
            border-top: 1px dashed #CBD5E1;
          }
          .qr-code-text {
            font-family: monospace;
            font-size: 9px;
            font-weight: 700;
            color: #475569;
          }
          .scan-badge {
            font-size: 7.5px;
            font-weight: 800;
            letter-spacing: 0.6px;
            color: #0D9488;
          }
        </style>
      </head>
      <body>
        <div class="sheet-header">
          <span><strong>PRODUCT:</strong> ${escapeHtml(product.name)} (${escapeHtml(product.qrCode)})</span>
          <span>${count} DESIGNER QR STICKERS • A4 SHEET</span>
        </div>
        <div class="grid">
          ${stickersRepeater}
        </div>
      </body>
    </html>
  `;

  await Print.printAsync({ html });
}

/**
 * Exports the Monthly Revenue & Gross Profit report as a PDF and opens the native share sheet.
 */
export async function exportMonthlyReportPdf(
  summary: MonthlySummary,
  totalStockCostValue: number,
  totalStockRetailValue: number
): Promise<void> {
  const bestRows = summary.bestSellers
    .map(
      (item, idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td style="text-align:right">${item.unitsSold}</td>
        <td style="text-align:right">£${item.revenue.toFixed(2)}</td>
        <td style="text-align:right">£${item.costOfGoods.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700;color:#0F766E">£${item.grossProfit.toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  const txRows = summary.salesTransactions
    .map((tx) => {
      const revenue = tx.quantity * tx.unitSellingPrice;
      const cost = tx.quantity * tx.unitBuyingPrice;
      const profit = revenue - cost;
      const dateStr = new Date(tx.timestamp).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${escapeHtml(tx.productName)}</td>
          <td style="text-align:right">${tx.quantity}</td>
          <td style="text-align:right">£${tx.unitBuyingPrice.toFixed(2)}</td>
          <td style="text-align:right">£${tx.unitSellingPrice.toFixed(2)}</td>
          <td style="text-align:right">£${revenue.toFixed(2)}</td>
          <td style="text-align:right;font-weight:700;color:#0F766E">£${profit.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Monthly Financial Report - ${escapeHtml(summary.monthLabel)}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 24px;
            color: #0F172A;
          }
          h1 {
            margin: 0 0 4px 0;
            font-size: 22px;
            color: #0F766E;
          }
          .subtitle {
            color: #64748B;
            font-size: 12px;
            margin-bottom: 20px;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .kpi-card {
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            padding: 12px;
            background: #F8FAFC;
          }
          .kpi-label {
            font-size: 11px;
            color: #64748B;
            text-transform: uppercase;
          }
          .kpi-value {
            font-size: 18px;
            font-weight: 800;
            margin-top: 4px;
          }
          h2 {
            font-size: 15px;
            margin: 20px 0 8px 0;
            border-bottom: 2px solid #0F766E;
            padding-bottom: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 18px;
          }
          th, td {
            border-bottom: 1px solid #E2E8F0;
            padding: 7px 6px;
            text-align: left;
          }
          th {
            background: #F1F5F9;
            font-weight: 700;
            color: #334155;
          }
          .note {
            font-size: 10px;
            color: #64748B;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>Stock & QR Inventory — Monthly Accountant Report</h1>
        <div class="subtitle">Reporting Period: <strong>${escapeHtml(summary.monthLabel)}</strong> • Generated ${new Date().toLocaleDateString('en-GB')}</div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Monthly Revenue</div>
            <div class="kpi-value">£${summary.totalRevenue.toFixed(2)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Cost of Goods Sold</div>
            <div class="kpi-value">£${summary.totalCostOfGoods.toFixed(2)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Monthly Gross Profit</div>
            <div class="kpi-value" style="color:#0F766E">£${summary.grossProfit.toFixed(2)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Gross Margin / Units</div>
            <div class="kpi-value">${summary.profitMarginPercent.toFixed(1)}% (${summary.totalUnitsSold} sold)</div>
          </div>
        </div>

        <h2>Product Performance Breakdown (${escapeHtml(summary.monthLabel)})</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Product</th>
              <th style="text-align:right">Units Sold</th>
              <th style="text-align:right">Revenue</th>
              <th style="text-align:right">Cost of Goods</th>
              <th style="text-align:right">Gross Profit</th>
            </tr>
          </thead>
          <tbody>
            ${bestRows || '<tr><td colspan="6">No sales recorded in this month.</td></tr>'}
          </tbody>
        </table>

        <h2>Itemised Sales Log (Locked Historical Prices)</h2>
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Product</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Unit Buy</th>
              <th style="text-align:right">Unit Sell</th>
              <th style="text-align:right">Total Sale</th>
              <th style="text-align:right">Gross Profit</th>
            </tr>
          </thead>
          <tbody>
            ${txRows || '<tr><td colspan="7">No sales recorded in this month.</td></tr>'}
          </tbody>
        </table>

        <div class="note">
          Current Live Inventory Valuation: Cost Value £${totalStockCostValue.toFixed(2)} | Retail Value £${totalStockRetailValue.toFixed(2)}.
          Note: Buying and selling prices are locked at the time of each sale so subsequent price changes never alter historical monthly figures.
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${summary.monthLabel} PDF Report`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}

/**
 * Exports the Monthly Revenue & Gross Profit report as an Excel-compatible CSV file.
 */
export async function exportMonthlyReportExcelCsv(summary: MonthlySummary): Promise<void> {
  const lines: string[] = [];
  lines.push(`"Stock & QR Inventory - Monthly Report (${summary.monthLabel})"`);
  lines.push(`"Monthly Revenue","£${summary.totalRevenue.toFixed(2)}"`);
  lines.push(`"Cost of Goods Sold","£${summary.totalCostOfGoods.toFixed(2)}"`);
  lines.push(`"Monthly Gross Profit","£${summary.grossProfit.toFixed(2)}"`);
  lines.push(`"Gross Profit Margin","${summary.profitMarginPercent.toFixed(2)}%"`);
  lines.push(`"Total Units Sold","${summary.totalUnitsSold}"`);
  lines.push('');
  lines.push(
    '"Date","Time","Product Name","Quantity Sold","Unit Buying Price (£)","Unit Selling Price (£)","Total Revenue (£)","Total Cost (£)","Gross Profit (£)","Recorded By"'
  );

  for (const tx of summary.salesTransactions) {
    const dt = new Date(tx.timestamp);
    const datePart = dt.toISOString().slice(0, 10);
    const timePart = dt.toTimeString().slice(0, 8);
    const rev = tx.quantity * tx.unitSellingPrice;
    const cost = tx.quantity * tx.unitBuyingPrice;
    const profit = rev - cost;
    lines.push(
      [
        `"${datePart}"`,
        `"${timePart}"`,
        `"${tx.productName.replace(/"/g, '""')}"`,
        tx.quantity,
        tx.unitBuyingPrice.toFixed(2),
        tx.unitSellingPrice.toFixed(2),
        rev.toFixed(2),
        cost.toFixed(2),
        profit.toFixed(2),
        `"${tx.performedByRole}"`,
      ].join(',')
    );
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  const fileUri = `${dir}Inventory_Report_${summary.monthKey}.csv`;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${summary.monthLabel} Excel (CSV) Report`,
    });
  }
}

/**
 * Prints or shares the Supplier Reorder List for all low-stock products.
 */
export async function printReorderListPdf(lowStockProducts: Product[]): Promise<void> {
  const rows = lowStockProducts
    .map((p) => {
      const suggestedOrder = Math.max(p.minStockLevel * 2 - p.quantity, p.minStockLevel);
      const estCost = suggestedOrder * p.buyingPrice;
      return `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong><br/><span style="color:#64748B;font-size:10px">${escapeHtml(p.qrCode)}${p.factoryBarcode ? ` • Barcode: ${escapeHtml(p.factoryBarcode)}` : ''}</span></td>
          <td>${escapeHtml(p.category)}</td>
          <td style="text-align:right;color:#DC2626;font-weight:700">${p.quantity}</td>
          <td style="text-align:right">${p.minStockLevel}</td>
          <td style="text-align:right;font-weight:700">${suggestedOrder}</td>
          <td style="text-align:right">£${p.buyingPrice.toFixed(2)}</td>
          <td style="text-align:right">£${estCost.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Supplier Reorder List</title>
        <style>
          body { font-family: sans-serif; padding: 24px; color: #0F172A; }
          h1 { font-size: 20px; color: #0F766E; margin-bottom: 4px; }
          p { font-size: 12px; color: #64748B; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
          th, td { border-bottom: 1px solid #E2E8F0; padding: 8px; text-align: left; }
          th { background: #F1F5F9; }
        </style>
      </head>
      <body>
        <h1>Supplier Reorder List (Low-Stock Items)</h1>
        <p>Generated ${new Date().toLocaleDateString('en-GB')} • ${lowStockProducts.length} items below minimum stock threshold</p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th style="text-align:right">Current Stock</th>
              <th style="text-align:right">Min Level</th>
              <th style="text-align:right">Suggested Order</th>
              <th style="text-align:right">Unit Cost</th>
              <th style="text-align:right">Est. Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;

  await Print.printAsync({ html });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
