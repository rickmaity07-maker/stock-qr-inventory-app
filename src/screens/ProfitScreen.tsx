import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currencySymbol } from '../logic/money';
import { useInventory } from '../context/InventoryContext';
import { exportMonthlyReportExcelCsv, exportMonthlyReportPdf } from '../utils/printAndExport';
import {
  Button,
  EmptyState,
  Field,
  LargeTitle,
  Row,
  Screen,
  Section,
  StatTile,
  Tap,
} from '../ui/components';
import { SyncIndicator } from '../ui/nav';
import { showAlert } from '../ui/dialog';
import { formatMoney, radius, space, tabular, type, usePalette } from '../ui/theme';

// Validated (dataviz validate_palette.js): CVD-safe pair, light and dark steps.
const SERIES = {
  light: { revenue: '#30B0C7', profit: '#5856D6' },
  dark: { revenue: '#2A9DB2', profit: '#5E5CE6' },
};

function shortMoney(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `${currencySymbol()}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : `${currencySymbol()}${abs.toFixed(0)}`;
  return n < 0 ? `−${s}` : s;
}

export default function DashboardScreen() {
  const c = usePalette();
  const series = SERIES[c.scheme];
  const { role, isClientDemoLocked, unlockOwnerRole, pinLockedUntil, availableMonths, getMonthlySummary, products } =
    useInventory();

  const [monthKey, setMonthKey] = useState(availableMonths[0]?.key);
  const [pin, setPin] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const activeKey = monthKey && availableMonths.some((m) => m.key === monthKey) ? monthKey : availableMonths[0]?.key;
  const summary = useMemo(() => getMonthlySummary(activeKey), [getMonthlySummary, activeKey]);

  const chart = useMemo(
    () =>
      availableMonths
        .slice(0, 6)
        .reverse()
        .map((m) => {
          const s = getMonthlySummary(m.key);
          return { key: m.key, label: m.label.split(' ')[0].slice(0, 3), revenue: s.totalRevenue, profit: s.grossProfit };
        }),
    [availableMonths, getMonthlySummary]
  );
  const max = Math.max(1, ...chart.map((d) => Math.max(d.revenue, d.profit)));

  const stock = useMemo(() => {
    let cost = 0;
    let retail = 0;
    for (const p of products) {
      const q = Math.max(0, p.quantity);
      cost += q * p.buyingPrice;
      retail += q * p.sellingPrice;
    }
    return { cost, retail };
  }, [products]);

  if (role !== 'OWNER' || isClientDemoLocked) {
    const unlock = async () => {
      const res = await unlockOwnerRole(pin);
      setPin('');
      if (res === 'wrong') showAlert('Wrong PIN', 'Try again.');
      if (res === 'locked') showAlert('Too many attempts', 'Wait 30 seconds and try again.');
    };
    const lockedOut = Date.now() < pinLockedUntil;
    return (
      <Screen>
        <LargeTitle title="Profit" />
        <EmptyState
          icon="lock-closed-outline"
          title="Owner only"
          message={
            isClientDemoLocked
              ? 'Revenue and profit are hidden in preview mode.'
              : 'Buying prices, revenue and profit are visible to the owner. Enter the owner PIN to continue.'
          }
        />
        {!isClientDemoLocked ? (
          <>
            <Section>
              <Field label="Owner PIN" value={pin} onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={8} onSubmitEditing={unlock} />
            </Section>
            <View style={{ padding: space.lg }}>
              <Button title={lockedOut ? 'Try again in a moment' : 'Unlock'} onPress={unlock} disabled={pin.length < 4 || lockedOut} />
            </View>
          </>
        ) : null}
      </Screen>
    );
  }

  const exportReport = async (kind: 'pdf' | 'csv') => {
    setExporting(kind);
    try {
      if (kind === 'pdf') await exportMonthlyReportPdf(summary, stock.cost, stock.retail);
      else await exportMonthlyReportExcelCsv(summary);
    } catch (e) {
      showAlert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

  const marginTone = summary.profitMarginPercent >= 20 ? 'green' : summary.profitMarginPercent > 0 ? 'orange' : 'red';

  return (
    <Screen>
      <LargeTitle title="Profit" subtitle={summary.monthLabel} accessory={<SyncIndicator />} />

      {/* KPI tiles */}
      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
        <StatTile label="Revenue" value={formatMoney(summary.totalRevenue)} />
        <StatTile label="Gross profit" value={formatMoney(summary.grossProfit)} tone={summary.grossProfit < 0 ? 'red' : undefined} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, marginTop: space.md }}>
        <StatTile label="Margin" value={`${summary.profitMarginPercent.toFixed(1)}%`} tone={summary.totalRevenue ? marginTone : undefined} />
        <StatTile label="Units sold" value={summary.totalUnitsSold.toLocaleString('en-GB')} />
      </View>

      {/* Month comparison — tap a month to select it */}
      <Section header="Last 6 months">
        <View style={{ padding: space.lg, backgroundColor: c.surface }}>
          <View style={{ flexDirection: 'row', gap: space.lg, marginBottom: space.md }} accessibilityRole="text">
            {[
              { name: 'Revenue', color: series.revenue },
              { name: 'Gross profit', color: series.profit },
            ].map((l) => (
              <View key={l.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color }} />
                <Text style={[type.footnote, { color: c.secondaryLabel }]}>{l.name}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 150, borderBottomWidth: 1, borderBottomColor: c.separator }}>
            {chart.map((d) => {
              const on = d.key === activeKey;
              const h = (v: number) => (v <= 0 ? 0 : Math.max(3, (v / max) * 120));
              return (
                <Tap
                  key={d.key}
                  onPress={() => setMonthKey(d.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d.label}: revenue ${formatMoney(d.revenue)}, profit ${formatMoney(d.profit)}`}
                  style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', borderRadius: radius.sm, backgroundColor: on ? c.fill : 'transparent' }}
                >
                  {on ? (
                    <Text style={[type.caption2, tabular, { color: c.label, marginBottom: 4 }]} numberOfLines={1}>
                      {shortMoney(d.revenue)}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                    <View style={{ width: 10, height: h(d.revenue), backgroundColor: series.revenue, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                    <View style={{ width: 10, height: h(d.profit), backgroundColor: series.profit, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                  </View>
                </Tap>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {chart.map((d) => (
              <Text
                key={d.key}
                style={[type.caption1, { flex: 1, textAlign: 'center', color: d.key === activeKey ? c.label : c.secondaryLabel, fontWeight: d.key === activeKey ? '600' : '400' }]}
              >
                {d.label}
              </Text>
            ))}
          </View>
        </View>
      </Section>

      <Section header={`${summary.monthLabel} in detail`}>
        <Row title="Revenue" value={formatMoney(summary.totalRevenue)} />
        <Row title="Cost of goods sold" value={formatMoney(summary.totalCostOfGoods)} />
        <Row title="Gross profit" value={formatMoney(summary.grossProfit)} />
        <Row title="Restocked" value={`${summary.totalUnitsRestocked} units · ${formatMoney(summary.restockSpend)}`} />
      </Section>

      <Section header="Best sellers" footer="Ranked by gross profit.">
        {summary.bestSellers.length === 0 ? (
          <Row title="No sales this month" />
        ) : (
          summary.bestSellers.slice(0, 5).map((p, i) => (
            <Row
              key={p.productId}
              title={p.productName}
              subtitle={`${p.unitsSold} sold · ${formatMoney(p.revenue)} revenue`}
              value={formatMoney(p.grossProfit)}
              left={<Text style={[type.headline, tabular, { color: c.secondaryLabel, width: 18 }]}>{i + 1}</Text>}
            />
          ))
        )}
      </Section>

      <Section header="Slowest sellers" footer="Consider promoting these or ordering fewer.">
        {summary.worstSellers.slice(0, 5).map((p) => (
          <Row key={p.productId} title={p.productName} value={`${p.unitsSold} sold`} />
        ))}
      </Section>

      <Section header="Stock value now">
        <Row title="At buying price" value={formatMoney(stock.cost)} />
        <Row title="At selling price" value={formatMoney(stock.retail)} />
      </Section>

      <Section
        header="For your accountant"
        footer="Prices are saved with every sale, so changing a price today never changes past months."
      >
        <Row
          title="Monthly report (PDF)"
          left={<Ionicons name="document-text-outline" size={20} color={c.tint} />}
          tinted
          onPress={() => exportReport('pdf')}
          disabled={exporting !== null}
        />
        <Row
          title="Sales spreadsheet (CSV)"
          left={<Ionicons name="grid-outline" size={20} color={c.tint} />}
          tinted
          onPress={() => exportReport('csv')}
          disabled={exporting !== null}
        />
      </Section>
    </Screen>
  );
}
