import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currencySymbol } from '../logic/money';
import { useInventory } from '../context/InventoryContext';
import { Product } from '../types/inventory';
import { printReorderListPdf } from '../utils/printAndExport';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  LargeTitle,
  Row,
  Screen,
  Section,
  SegmentedControl,
  Sheet,
  Stepper,
  StatTile,
} from '../ui/components';
import { SyncIndicator } from '../ui/nav';
import { showAlert } from '../ui/dialog';
import { formatMoney, space, type, usePalette } from '../ui/theme';
import { daysUntil, isValidIsoDate, parseNonNegativeNumber } from '../logic/inventoryLogic';

type View_ = 'REORDER' | 'EXPIRY' | 'ALL';

function suggestedOrder(p: Product) {
  return Math.max(p.minStockLevel * 2 - p.quantity, p.minStockLevel, 1);
}

function expiryText(days: number) {
  if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export default function StockScreen() {
  const c = usePalette();
  const { products, lowStockProducts, expiringProducts, role, isClientDemoLocked, consumeDemoAction, recordRestock, getProduct } =
    useInventory();

  const [view, setView] = useState<View_>(lowStockProducts.length ? 'REORDER' : 'ALL');
  const [restockId, setRestockId] = useState<string | null>(null);
  const [qty, setQty] = useState('10');
  const [price, setPrice] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  const restockProduct = restockId ? getProduct(restockId) ?? null : null;

  const totals = useMemo(() => {
    let units = 0;
    let cost = 0;
    let retail = 0;
    for (const p of products) {
      const q = Math.max(0, p.quantity);
      units += q;
      cost += q * p.buyingPrice;
      retail += q * p.sellingPrice;
    }
    return { units, cost, retail };
  }, [products]);

  const reorderCost = lowStockProducts.reduce((sum, p) => sum + suggestedOrder(p) * p.buyingPrice, 0);

  const openRestock = (p: Product) => {
    setRestockId(p.id);
    setQty(String(suggestedOrder(p)));
    setPrice(p.buyingPrice.toFixed(2));
    setExpiry(p.expiryDate || '');
  };

  const priceValue = parseNonNegativeNumber(price);
  const priceError = price.trim() && priceValue === null ? 'Enter a price like 12.50' : null;
  const expiryError = expiry.trim() && !isValidIsoDate(expiry.trim()) ? 'Use YYYY-MM-DD' : null;
  const qtyNumber = parseInt(qty, 10) || 0;

  const confirmRestock = async () => {
    if (!restockProduct || busy || qtyNumber < 1 || priceError || expiryError) return;
    if (isClientDemoLocked && !consumeDemoAction()) {
      setRestockId(null);
      showAlert('Demo limit reached', 'Unlock the full version in Settings.');
      return;
    }
    setBusy(true);
    try {
      await recordRestock(restockProduct.id, qtyNumber, priceValue ?? restockProduct.buyingPrice, expiry.trim() || undefined);
      setRestockId(null);
    } catch (e) {
      showAlert('Restock not recorded', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const printOrder = async () => {
    if (isClientDemoLocked) {
      showAlert('Locked in preview mode', 'Printing is available in the full version.');
      return;
    }
    try {
      await printReorderListPdf(lowStockProducts);
    } catch (e) {
      showAlert('Could not print', e instanceof Error ? e.message : String(e));
    }
  };

  const expiring = expiringProducts
    .map((p) => ({ p, days: daysUntil(p.expiryDate as string) as number }))
    .filter((x) => x.days !== null);

  return (
    <Screen>
      <LargeTitle title="Stock" accessory={<SyncIndicator />} />

      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
        <StatTile label="Units in stock" value={totals.units.toLocaleString('en-GB')} />
        <StatTile label="Need reorder" value={String(lowStockProducts.length)} tone={lowStockProducts.length ? 'orange' : 'green'} />
      </View>
      {role === 'OWNER' ? (
        <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, marginTop: space.md }}>
          <StatTile label="Stock value at cost" value={formatMoney(totals.cost)} />
          <StatTile label="At selling price" value={formatMoney(totals.retail)} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <SegmentedControl
          options={[
            { value: 'REORDER', label: `Reorder${lowStockProducts.length ? ` (${lowStockProducts.length})` : ''}` },
            { value: 'EXPIRY', label: 'Expiry' },
            { value: 'ALL', label: 'All stock' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'REORDER' ? (
        lowStockProducts.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="Nothing to reorder" message="Every product is above its low-stock alert level." />
        ) : (
          <>
            <Section
              header="At or below alert level"
              footer={role === 'OWNER' ? `Suggested order costs about ${formatMoney(reorderCost)} at current buying prices.` : undefined}
            >
              {lowStockProducts.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.quantity <= 0 ? 'Out of stock' : `${p.quantity} left`} · alert at ${p.minStockLevel} · order ${suggestedOrder(p)}`}
                  onPress={() => openRestock(p)}
                  left={<Ionicons name={p.quantity <= 0 ? 'alert-circle' : 'warning'} size={22} color={p.quantity <= 0 ? c.red : c.orange} />}
                  right={<Text style={[type.subhead, { color: c.tint }]}>Restock</Text>}
                />
              ))}
            </Section>
            <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
              <Button title="Print supplier order" icon="print-outline" variant="tinted" onPress={printOrder} />
            </View>
          </>
        )
      ) : null}

      {view === 'EXPIRY' ? (
        expiring.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No expiry dates" message="Add an expiry or warranty date to a product to track it here." />
        ) : (
          <Section header="Soonest first">
            {expiring.map(({ p, days }) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={`${p.expiryDate} · ${p.quantity} in stock`}
                right={<Badge text={expiryText(days)} tone={days < 0 ? 'red' : days <= 30 ? 'orange' : 'green'} />}
              />
            ))}
          </Section>
        )
      ) : null}

      {view === 'ALL' ? (
        products.length === 0 ? (
          <EmptyState icon="cube-outline" title="No products yet" message="Add products in the Products tab." />
        ) : (
          <Section header={`${products.length} products`}>
            {[...products]
              .sort((a, b) => a.quantity - b.quantity)
              .map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={p.category}
                  onPress={() => openRestock(p)}
                  right={
                    <Badge
                      text={p.quantity <= 0 ? 'Out' : `${p.quantity}`}
                      tone={p.quantity <= 0 ? 'red' : p.quantity <= p.minStockLevel ? 'orange' : 'gray'}
                    />
                  }
                />
              ))}
          </Section>
        )
      ) : null}

      <Sheet visible={Boolean(restockProduct)} title="Restock" onClose={() => setRestockId(null)}>
        {restockProduct ? (
          <>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Text style={[type.title3, { color: c.label }]}>{restockProduct.name}</Text>
              <Text style={[type.subhead, { color: c.secondaryLabel }]}>{restockProduct.quantity} in stock now</Text>
            </View>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
              <Stepper value={qty} onChange={setQty} min={1} bigStep={10} />
            </View>
            <Section>
              <Field label="Buying price per unit" value={price} onChangeText={setPrice} keyboardType="decimal-pad" suffix={currencySymbol()} error={priceError} />
              <Field label="Expiry or warranty date (optional)" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" autoCapitalize="none" error={expiryError} />
            </Section>
            <View style={{ padding: space.lg }}>
              <Button
                title={`Add ${qtyNumber || 0} to stock`}
                icon="arrow-up-circle"
                color={c.indigo}
                onPress={confirmRestock}
                loading={busy}
                disabled={qtyNumber < 1 || Boolean(priceError || expiryError)}
              />
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
