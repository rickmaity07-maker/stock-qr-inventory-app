import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../src/context/InventoryContext';
import { Product } from '../../src/types/inventory';
import { printReorderListPdf } from '../../src/utils/printAndExport';

type StockTab = 'REORDER' | 'EXPIRY' | 'ALL_STOCK';

export default function StockScreen() {
  const { products, lowStockProducts, expiringProducts, role, recordRestock } =
    useInventory();

  const [activeTab, setActiveTab] = useState<StockTab>('REORDER');
  const [quickRestockProduct, setQuickRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState<string>('10');
  const [restockBuyPrice, setRestockBuyPrice] = useState<string>('');
  const [restockExpiry, setRestockExpiry] = useState<string>('');

  const openQuickRestock = (product: Product) => {
    const suggested = Math.max(product.minStockLevel * 2 - product.quantity, 5);
    setQuickRestockProduct(product);
    setRestockQty(String(suggested));
    setRestockBuyPrice(product.buyingPrice.toFixed(2));
    setRestockExpiry(product.expiryDate || '');
  };

  const handleConfirmQuickRestock = async () => {
    if (!quickRestockProduct) return;
    const qty = Math.max(1, parseInt(restockQty, 10) || 1);
    const price = parseFloat(restockBuyPrice);
    await recordRestock(
      quickRestockProduct.id,
      qty,
      !isNaN(price) && price >= 0 ? price : quickRestockProduct.buyingPrice,
      restockExpiry.trim() || undefined,
      'Reorder list restock'
    );
    setQuickRestockProduct(null);
  };

  const getDaysUntilExpiry = (isoDate?: string): number | null => {
    if (!isoDate) return null;
    const target = new Date(isoDate).getTime();
    if (isNaN(target)) return null;
    const now = Date.now();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  };

  return (
    <View style={styles.container}>
      {/* SUB-TABS */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'REORDER' && styles.tabBtnActive]}
          onPress={() => setActiveTab('REORDER')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'REORDER' && styles.tabBtnTextActive,
            ]}
          >
            Reorder List ({lowStockProducts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'EXPIRY' && styles.tabBtnActive]}
          onPress={() => setActiveTab('EXPIRY')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'EXPIRY' && styles.tabBtnTextActive,
            ]}
          >
            Expiry Tracker ({expiringProducts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'ALL_STOCK' && styles.tabBtnActive]}
          onPress={() => setActiveTab('ALL_STOCK')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'ALL_STOCK' && styles.tabBtnTextActive,
            ]}
          >
            Live Stock ({products.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* 1. REORDER LIST (LOW-STOCK ALERTS) */}
        {activeTab === 'REORDER' && (
          <>
            <View style={styles.bannerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Automatic Supplier Reorder List</Text>
                <Text style={styles.bannerDesc}>
                  Every product at or below its minimum stock alert level appears here automatically.
                </Text>
              </View>
              {lowStockProducts.length > 0 && (
                <TouchableOpacity
                  style={styles.exportSupplierBtn}
                  onPress={() => printReorderListPdf(lowStockProducts)}
                >
                  <Ionicons name="print-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.exportSupplierBtnText}>Print Order</Text>
                </TouchableOpacity>
              )}
            </View>

            {lowStockProducts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-done-circle" size={48} color="#10B981" />
                <Text style={styles.emptyTitle}>All Stock Levels Healthy!</Text>
                <Text style={styles.emptySubtitle}>
                  No products are currently below their minimum stock threshold.
                </Text>
              </View>
            ) : (
              lowStockProducts.map((item) => {
                const suggestedQty = Math.max(
                  item.minStockLevel * 2 - item.quantity,
                  item.minStockLevel
                );
                return (
                  <View key={item.id} style={styles.alertCard}>
                    <View style={styles.alertCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemCode}>
                          QR: {item.qrCode} • Category: {item.category}
                        </Text>
                      </View>
                      <View style={styles.lowBadge}>
                        <Ionicons name="warning" size={13} color="#DC2626" />
                        <Text style={styles.lowBadgeText}>
                          {item.quantity} left (Min {item.minStockLevel})
                        </Text>
                      </View>
                    </View>

                    <View style={styles.reorderFooter}>
                      <Text style={styles.suggestedText}>
                        Suggested supplier order: <strong>+{suggestedQty} units</strong>
                        {role === 'OWNER'
                          ? ` (Est. £${(suggestedQty * item.buyingPrice).toFixed(2)})`
                          : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.quickRestockBtn}
                        onPress={() => openQuickRestock(item)}
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.quickRestockBtnText}>Restock</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* 2. EXPIRY DATES TRACKER */}
        {activeTab === 'EXPIRY' && (
          <>
            <View style={styles.bannerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Perishable Stock Expiry Tracker</Text>
                <Text style={styles.bannerDesc}>
                  Products with recorded expiry dates sorted by soonest expiry date.
                </Text>
              </View>
            </View>

            {expiringProducts.map((item) => {
              const daysLeft = getDaysUntilExpiry(item.expiryDate);
              const isExpired = daysLeft !== null && daysLeft < 0;
              const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
              return (
                <View key={item.id} style={styles.alertCard}>
                  <View style={styles.alertCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemCode}>
                        In Stock: {item.quantity} units • Expiry: {item.expiryDate}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.expiryStatusPill,
                        isExpired
                          ? styles.expiryExpired
                          : isDueSoon
                          ? styles.expirySoon
                          : styles.expirySafe,
                      ]}
                    >
                      <Text
                        style={[
                          styles.expiryStatusText,
                          isExpired
                            ? { color: '#DC2626' }
                            : isDueSoon
                            ? { color: '#B45309' }
                            : { color: '#0F766E' },
                        ]}
                      >
                        {daysLeft === null
                          ? 'Unknown'
                          : daysLeft < 0
                          ? `Expired (${Math.abs(daysLeft)}d ago)`
                          : daysLeft === 0
                          ? 'Expires Today!'
                          : `Expires in ${daysLeft}d`}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* 3. ALL LIVE STOCK */}
        {activeTab === 'ALL_STOCK' &&
          products.map((item) => {
            const isLow = item.quantity <= item.minStockLevel;
            return (
              <View key={item.id} style={styles.alertCard}>
                <View style={styles.alertCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCode}>
                      QR: {item.qrCode} • Min Alert: {item.minStockLevel}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.liveQtyValue,
                        { color: isLow ? '#DC2626' : '#0F766E' },
                      ]}
                    >
                      {item.quantity} units
                    </Text>
                    <Text style={styles.itemCode}>
                      Sell: £{item.sellingPrice.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
      </ScrollView>

      {/* QUICK RESTOCK MODAL */}
      <Modal
        visible={Boolean(quickRestockProduct)}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickRestockProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {quickRestockProduct && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    Restock: {quickRestockProduct.name}
                  </Text>
                  <TouchableOpacity onPress={() => setQuickRestockProduct(null)}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalBody}>
                  <Text style={styles.label}>Incoming Quantity</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={restockQty}
                    onChangeText={setRestockQty}
                  />
                  <Text style={styles.label}>Unit Buying Price (£)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={restockBuyPrice}
                    onChangeText={setRestockBuyPrice}
                  />
                  <Text style={styles.label}>Expiry Date (Optional, YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={restockExpiry}
                    onChangeText={setRestockExpiry}
                    placeholder="2027-06-15"
                  />
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={handleConfirmQuickRestock}
                  >
                    <Text style={styles.confirmBtnText}>
                      Add +{parseInt(restockQty, 10) || 1} Units to Stock
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#0F766E',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  scrollBody: {
    padding: 12,
    gap: 10,
    paddingBottom: 28,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  bannerDesc: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  exportSupplierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 5,
  },
  exportSupplierBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyBox: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  lowBadgeText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  reorderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  suggestedText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  quickRestockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  quickRestockBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  expiryStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  expiryExpired: {
    backgroundColor: '#FEF2F2',
  },
  expirySoon: {
    backgroundColor: '#FFFBEB',
  },
  expirySafe: {
    backgroundColor: '#F0FDFA',
  },
  expiryStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  liveQtyValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  confirmBtn: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
