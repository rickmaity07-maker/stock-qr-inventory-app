import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../src/context/InventoryContext';
import {
  exportMonthlyReportExcelCsv,
  exportMonthlyReportPdf,
} from '../../src/utils/printAndExport';

export default function DashboardScreen() {
  const {
    products,
    role,
    unlockOwnerRole,
    availableMonths,
    getMonthlySummary,
  } = useInventory();

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    availableMonths[0]?.key || '2026-10'
  );
  const [pinInput, setPinInput] = useState<string>('');

  const summary = useMemo(
    () => getMonthlySummary(selectedMonthKey),
    [getMonthlySummary, selectedMonthKey]
  );

  // Total stock value at a glance
  const { totalStockCostValue, totalStockRetailValue, totalUnitsInStock } = useMemo(() => {
    let cost = 0;
    let retail = 0;
    let units = 0;
    for (const p of products) {
      cost += p.quantity * p.buyingPrice;
      retail += p.quantity * p.sellingPrice;
      units += p.quantity;
    }
    return {
      totalStockCostValue: cost,
      totalStockRetailValue: retail,
      totalUnitsInStock: units,
    };
  }, [products]);

  // Month-by-month comparison data
  const comparisonData = useMemo(() => {
    return availableMonths
      .slice(0, 5)
      .reverse()
      .map((m) => {
        const s = getMonthlySummary(m.key);
        return {
          key: m.key,
          shortLabel: m.label.slice(0, 3) + ' ' + m.key.slice(2, 4),
          revenue: s.totalRevenue,
          profit: s.grossProfit,
        };
      });
  }, [availableMonths, getMonthlySummary]);

  const maxChartRevenue = useMemo(() => {
    return Math.max(100, ...comparisonData.map((d) => d.revenue));
  }, [comparisonData]);

  // STAFF ROLE LOCK SCREEN
  if (role !== 'OWNER') {
    const handleUnlock = async () => {
      const ok = await unlockOwnerRole(pinInput);
      if (ok) {
        setPinInput('');
      } else {
        Alert.alert('Incorrect PIN', 'Default Owner PIN is 1234.');
      }
    };

    return (
      <View style={styles.lockContainer}>
        <View style={styles.lockCard}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed" size={32} color="#0F766E" />
          </View>
          <Text style={styles.lockTitle}>Owner Access Required</Text>
          <Text style={styles.lockSubtitle}>
            Staff accounts can sell, restock, and view stock levels. Enter the Owner PIN to view monthly revenue, gross profit, and export accountant reports.
          </Text>
          <TextInput
            style={styles.pinInput}
            placeholder="Enter Owner PIN (Default: 1234)"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            secureTextEntry
            value={pinInput}
            onChangeText={setPinInput}
          />
          <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlock}>
            <Ionicons name="key-outline" size={18} color="#FFFFFF" />
            <Text style={styles.unlockBtnText}>Unlock Profit Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* MONTH SELECTOR */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthRow}
      >
        {availableMonths.map((m) => {
          const active = m.key === selectedMonthKey;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.monthChip, active && styles.monthChipActive]}
              onPress={() => setSelectedMonthKey(m.key)}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={active ? '#FFFFFF' : '#475569'}
              />
              <Text
                style={[styles.monthChipText, active && styles.monthChipTextActive]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* MONTHLY REVENUE & GROSS PROFIT KPI CARDS */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
          <Text style={styles.kpiLabelLight}>Monthly Gross Profit</Text>
          <Text style={styles.kpiValueLight}>£{summary.grossProfit.toFixed(2)}</Text>
          <Text style={styles.kpiSubLight}>
            {summary.profitMarginPercent.toFixed(1)}% gross margin
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Monthly Revenue</Text>
          <Text style={styles.kpiValue}>£{summary.totalRevenue.toFixed(2)}</Text>
          <Text style={styles.kpiSub}>
            {summary.totalUnitsSold} units sold • Cost £{summary.totalCostOfGoods.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* TOTAL STOCK VALUE AT A GLANCE */}
      <View style={styles.stockValuationCard}>
        <View>
          <Text style={styles.valuationTitle}>Total Live Stock Value</Text>
          <Text style={styles.valuationSub}>{totalUnitsInStock} total units in stock</Text>
        </View>
        <View style={styles.valuationFigures}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.valuationSmallLabel}>At Cost</Text>
            <Text style={styles.valuationCostVal}>
              £{totalStockCostValue.toFixed(2)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.valuationSmallLabel}>Retail Value</Text>
            <Text style={styles.valuationRetailVal}>
              £{totalStockRetailValue.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* REPORT EXPORT FOR ACCOUNTANT */}
      <View style={styles.exportSectionCard}>
        <Text style={styles.sectionHeader}>
          Export {summary.monthLabel} Report for Accountant
        </Text>
        <Text style={styles.sectionSub}>
          Prices are saved with each sale, so changing a price today never alters past months&apos; figures.
        </Text>
        <View style={styles.exportBtnsRow}>
          <TouchableOpacity
            style={styles.exportPdfBtn}
            onPress={() =>
              exportMonthlyReportPdf(
                summary,
                totalStockCostValue,
                totalStockRetailValue
              )
            }
          >
            <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
            <Text style={styles.exportPdfBtnText}>Download PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exportExcelBtn}
            onPress={() => exportMonthlyReportExcelCsv(summary)}
          >
            <Ionicons name="grid-outline" size={18} color="#0F766E" />
            <Text style={styles.exportExcelBtnText}>Export Excel (CSV)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MONTH-BY-MONTH COMPARISON CHART */}
      <View style={styles.sectionCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.sectionHeader}>Month-by-Month Comparison</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: '#94A3B8' }]} />
              <Text style={styles.legendText}>Revenue</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: '#0F766E' }]} />
              <Text style={styles.legendText}>Gross Profit</Text>
            </View>
          </View>
        </View>

        <View style={styles.chartBarsWrap}>
          {comparisonData.map((col) => {
            const revHeight = Math.max(8, (col.revenue / maxChartRevenue) * 110);
            const profHeight = Math.max(6, (col.profit / maxChartRevenue) * 110);
            return (
              <View key={col.key} style={styles.chartCol}>
                <Text style={styles.chartTopVal}>£{col.profit.toFixed(0)}</Text>
                <View style={styles.barPair}>
                  <View
                    style={[
                      styles.barItem,
                      { height: revHeight, backgroundColor: '#CBD5E1' },
                    ]}
                  />
                  <View
                    style={[
                      styles.barItem,
                      { height: profHeight, backgroundColor: '#0F766E' },
                    ]}
                  />
                </View>
                <Text style={styles.chartMonthLabel}>{col.shortLabel}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* BEST SELLERS */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>
          Best Sellers ({summary.monthLabel})
        </Text>
        {summary.bestSellers.length === 0 ? (
          <Text style={styles.emptyText}>No sales recorded for this month yet.</Text>
        ) : (
          summary.bestSellers.slice(0, 5).map((item, index) => (
            <View key={item.productId} style={styles.rankRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>#{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankName}>{item.productName}</Text>
                <Text style={styles.rankSub}>
                  {item.unitsSold} sold • Revenue £{item.revenue.toFixed(2)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rankProfit}>+£{item.grossProfit.toFixed(2)}</Text>
                <Text style={styles.rankSub}>profit</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* WORST / SLOWEST SELLERS */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>
          Slowest / Worst Sellers ({summary.monthLabel})
        </Text>
        {summary.worstSellers.slice(0, 3).map((item) => (
          <View key={item.productId} style={styles.rankRow}>
            <View style={[styles.rankBadge, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="trending-down" size={14} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankName}>{item.productName}</Text>
              <Text style={styles.rankSub}>{item.unitsSold} units sold this month</Text>
            </View>
            <Text style={[styles.rankProfit, { color: '#64748B' }]}>
              £{item.grossProfit.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 32,
  },
  monthRow: {
    gap: 8,
    paddingBottom: 2,
  },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  monthChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardPrimary: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  kpiLabelLight: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CCFBF1',
    textTransform: 'uppercase',
  },
  kpiValueLight: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 6,
  },
  kpiSubLight: {
    fontSize: 11,
    color: '#CCFBF1',
    marginTop: 4,
  },
  stockValuationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 14,
  },
  valuationTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  valuationSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  valuationFigures: {
    flexDirection: 'row',
    gap: 16,
  },
  valuationSmallLabel: {
    color: '#94A3B8',
    fontSize: 10,
  },
  valuationCostVal: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  valuationRetailVal: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '800',
  },
  exportSectionCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 12,
  },
  exportBtnsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exportPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
  },
  exportPdfBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  exportExcelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    gap: 6,
  },
  exportExcelBtnText: {
    color: '#0F766E',
    fontWeight: '800',
    fontSize: 13,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  chartBarsWrap: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chartCol: {
    alignItems: 'center',
  },
  chartTopVal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 4,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barItem: {
    width: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  chartMonthLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '600',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
  },
  rankName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rankSub: {
    fontSize: 11,
    color: '#64748B',
  },
  rankProfit: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  lockContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 20,
  },
  lockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lockIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  lockSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    height: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  unlockBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
