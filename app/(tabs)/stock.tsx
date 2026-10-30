import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../src/context/InventoryContext';
import { Product } from '../../src/types/inventory';
import { printReorderListPdf } from '../../src/utils/printAndExport';

type StockTab = 'REORDER' | 'EXPIRY' | 'ALL_STOCK';

export default function StockScreen() {
  const {
    products,
    lowStockProducts,
    expiringProducts,
    role,
    isClientDemoLocked,
    recordRestock,
  } = useInventory();

  const [activeTab, setActiveTab] = useState<StockTab>('REORDER');
  const [quickRestockProduct, setQuickRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState<string>('10');
  const [restockBuyPrice, setRestockBuyPrice] = useState<string>('');
  const [restockExpiry, setRestockExpiry] = useState<string>('');

  const openQuickRestock = (product: Product) => {
    if (isClientDemoLocked) {
      Alert.alert(
        '🔒 Locked in Client Preview',
        'Restocking and supplier order exports are disabled in this Client Demo build. Contact the developer to unlock the full Mobile Store system.'
      );
      return;
    }
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
            Warranty & Batch ({expiringProducts.length})
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
                  onPress={() => {
                    if (isClientDemoLocked) {
                      Alert.alert(
                        '🔒 Locked in Client Preview',
                        'Printing supplier purchase orders is disabled in the Client Demo Preview.'
                      );
                      return;
                    }
                    printReorderListPdf(lowStockProducts);
                  }}
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
                        Suggested supplier order:{' '}
                        <Text style={{ fontWeight: '800' }}>+{suggestedQty} units</Text>
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
                <Text style={styles.bannerTitle}>Mobile Warranty & Batch Tracker</Text>
                <Text style={styles.bannerDesc}>
                  Devices, power banks, and sealed accessories tracked by distributor warranty or batch check date.
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
                            : { color: '#007AFF' },
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
                        { color: isLow ? '#DC2626' : '#007AFF' },
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
                    <Ionicons name="close" size={24} color="#1C1C1E" />
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
    backgroundColor: '#F2F2F7',
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 3,
    gap: 4,
    borderRadius: 11,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: -0.1,
  },
  tabBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  scrollBody: {
    padding: 16,
    gap: 10,
    paddingBottom: 28,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 20,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  bannerDesc: {
    color: '#8E8E93',
    fontSize: 11.5,
    marginTop: 3,
    lineHeight: 16,
  },
  exportSupplierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 5,
  },
  exportSupplierBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyBox: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  alertCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.2,
  },
  itemCode: {
    fontSize: 11.5,
    color: '#8E8E93',
    marginTop: 3,
  },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.14)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  lowBadgeText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '600',
  },
  reorderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  suggestedText: {
    fontSize: 12,
    color: '#3A3A3C',
    flex: 1,
  },
  quickRestockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 5,
  },
  quickRestockBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  expiryStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  expiryExpired: {
    backgroundColor: 'rgba(255, 59, 48, 0.14)',
  },
  expirySoon: {
    backgroundColor: 'rgba(255, 149, 0, 0.14)',
  },
  expirySafe: {
    backgroundColor: 'rgba(52, 199, 89, 0.14)',
  },
  expiryStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  liveQtyValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.3,
  },
  modalBody: {
    padding: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    height: 44,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#000000',
  },
  confirmBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 20,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
