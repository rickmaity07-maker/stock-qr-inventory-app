import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../src/context/InventoryContext';
import { Product } from '../../src/types/inventory';
import { printProductQrLabels } from '../../src/utils/printAndExport';
import { DesignerQrCode } from '../../src/components/DesignerQrCode';

export default function ProductsScreen() {
  const { products, role, isClientDemoLocked, addProduct, updateProduct, deleteProduct } =
    useInventory();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Add / Edit Product Modal State
  const [editorVisible, setEditorVisible] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [buyingPrice, setBuyingPrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [minStockLevel, setMinStockLevel] = useState<string>('5');
  const [factoryBarcode, setFactoryBarcode] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');

  // QR Label Print Modal State
  const [qrModalProduct, setQrModalProduct] = useState<Product | null>(null);
  const [sheetCopiesCount, setSheetCopiesCount] = useState<string>('24');
  const qrSvgRef = useRef<any>(null);

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchesCategory;
      return (
        matchesCategory &&
        (p.name.toLowerCase().includes(q) ||
          p.qrCode.toLowerCase().includes(q) ||
          (p.factoryBarcode && p.factoryBarcode.toLowerCase().includes(q)))
      );
    });
  }, [products, searchQuery, selectedCategory]);

  const showClientLockAlert = (featureName: string) => {
    Alert.alert(
      '🔒 Locked in Client Preview',
      `${featureName} is disabled in this Client Demo build. Contact the developer or enter your License Key in Settings to unlock full Mobile Store access.`
    );
  };

  const openAddModal = () => {
    if (isClientDemoLocked) {
      showClientLockAlert('Adding new mobile store inventory');
      return;
    }
    setEditingProduct(null);
    setName('');
    setCategory('Smartphones');
    setBuyingPrice('');
    setSellingPrice('');
    setQuantity('10');
    setMinStockLevel('5');
    setFactoryBarcode('');
    setExpiryDate('');
    setEditorVisible(true);
  };

  const openEditModal = (product: Product) => {
    if (isClientDemoLocked) {
      showClientLockAlert('Editing product prices & stock');
      return;
    }
    setEditingProduct(product);
    setName(product.name);
    setCategory(product.category);
    setBuyingPrice(String(product.buyingPrice));
    setSellingPrice(String(product.sellingPrice));
    setQuantity(String(product.quantity));
    setMinStockLevel(String(product.minStockLevel));
    setFactoryBarcode(product.factoryBarcode || '');
    setExpiryDate(product.expiryDate || '');
    setEditorVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a product name.');
      return;
    }
    const buy = parseFloat(buyingPrice) || 0;
    const sell = parseFloat(sellingPrice) || 0;
    const qty = parseInt(quantity, 10) || 0;
    const min = parseInt(minStockLevel, 10) || 5;

    if (editingProduct) {
      await updateProduct(editingProduct.id, {
        name: name.trim(),
        category: category.trim() || 'General',
        buyingPrice: buy,
        sellingPrice: sell,
        quantity: qty,
        minStockLevel: min,
        factoryBarcode: factoryBarcode.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
      });
      setEditorVisible(false);
    } else {
      const created = await addProduct({
        name: name.trim(),
        category: category.trim() || 'General',
        buyingPrice: buy,
        sellingPrice: sell,
        quantity: qty,
        minStockLevel: min,
        factoryBarcode: factoryBarcode.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
      });
      setEditorVisible(false);
      // Immediately show generated QR sticker modal for the new product
      setQrModalProduct(created);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    if (isClientDemoLocked) {
      showClientLockAlert('Deleting catalogue products');
      return;
    }
    Alert.alert(
      'Delete Product',
      `Remove "${product.name}" from the catalogue? Past monthly sales history will still remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteProduct(product.id),
        },
      ]
    );
  };

  const triggerLabelPrint = (product: Product, mode: 'SINGLE' | 'A4_SHEET') => {
    if (isClientDemoLocked) {
      showClientLockAlert('Printing QR thermal labels & A4 sticker sheets');
      return;
    }
    const copies = parseInt(sheetCopiesCount, 10) || 24;
    if (qrSvgRef.current && typeof qrSvgRef.current.toDataURL === 'function') {
      qrSvgRef.current.toDataURL((base64Data: string) => {
        printProductQrLabels(product, mode, copies, base64Data);
      });
    } else {
      printProductQrLabels(product, mode, copies);
    }
  };

  return (
    <View style={styles.container}>
      {/* SEARCH & ADD PRODUCT BAR */}
      <View style={styles.topSearchRow}>
        <View style={styles.searchInputBox}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, QR code, or barcode..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {Boolean(searchQuery) && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
        {role === 'OWNER' && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Product</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* CATEGORY CHIPS */}
      <View style={styles.categoryScrollWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* PRODUCT CATALOGUE LIST */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredProducts.map((product) => {
          const isLowStock = product.quantity <= product.minStockLevel;
          const unitProfit = product.sellingPrice - product.buyingPrice;
          return (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.categoryTagRow}>
                    <Text style={styles.categoryTag}>{product.category}</Text>
                    {product.expiryDate && (
                      <Text style={styles.expiryTag}>Exp: {product.expiryDate}</Text>
                    )}
                  </View>
                  <Text style={styles.productTitle}>{product.name}</Text>
                  <Text style={styles.qrSubtitle}>
                    QR: {product.qrCode}
                    {product.factoryBarcode ? ` • Barcode: ${product.factoryBarcode}` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.qrPreviewBox}
                  onPress={() => setQrModalProduct(product)}
                >
                  <DesignerQrCode value={product.qrCode} size={52} />
                  <Text style={styles.qrPrintHint}>Designer QR</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricBlock}>
                  <Text style={styles.metricLabel}>Selling Price</Text>
                  <Text style={styles.metricValue}>£{product.sellingPrice.toFixed(2)}</Text>
                </View>

                {role === 'OWNER' && (
                  <>
                    <View style={styles.metricBlock}>
                      <Text style={styles.metricLabel}>Buying Price</Text>
                      <Text style={styles.metricValue}>£{product.buyingPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.metricBlock}>
                      <Text style={styles.metricLabel}>Unit Profit</Text>
                      <Text style={[styles.metricValue, { color: '#0F766E' }]}>
                        +£{unitProfit.toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}

                <View style={styles.metricBlockRight}>
                  <Text style={styles.metricLabel}>In Stock</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: isLowStock ? '#DC2626' : '#0F172A' },
                    ]}
                  >
                    {product.quantity} units
                  </Text>
                </View>
              </View>

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => setQrModalProduct(product)}
                >
                  <Ionicons name="print-outline" size={16} color="#0F766E" />
                  <Text style={styles.actionBtnPrimaryText}>QR & Label Print</Text>
                </TouchableOpacity>

                {role === 'OWNER' && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={() => openEditModal(product)}
                    >
                      <Ionicons name="create-outline" size={16} color="#334155" />
                      <Text style={styles.actionBtnSecondaryText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnDanger}
                      onPress={() => handleDeleteProduct(product)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* ADD / EDIT PRODUCT MODAL */}
      <Modal
        visible={editorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </Text>
              <TouchableOpacity onPress={() => setEditorVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Product Name *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. iPhone 16 Pro Max 256GB (Natural Titanium)"
              />

              <Text style={styles.inputLabel}>Category</Text>
              <TextInput
                style={styles.textInput}
                value={category}
                onChangeText={setCategory}
                placeholder="e.g. Smartphones, Chargers & Cables, Cases"
              />

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Buying Price (£) *</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="decimal-pad"
                    value={buyingPrice}
                    onChangeText={setBuyingPrice}
                    placeholder="0.00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Selling Price (£) *</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="decimal-pad"
                    value={sellingPrice}
                    onChangeText={setSellingPrice}
                    placeholder="0.00"
                  />
                </View>
              </View>

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Starting Stock Quantity</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="number-pad"
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="10"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Low-Stock Alert Level</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="number-pad"
                    value={minStockLevel}
                    onChangeText={setMinStockLevel}
                    placeholder="5"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>
                Existing Factory Barcode (Optional — skip if printing QR sticker)
              </Text>
              <TextInput
                style={styles.textInput}
                value={factoryBarcode}
                onChangeText={setFactoryBarcode}
                placeholder="e.g. 5012345678900"
              />

              <Text style={styles.inputLabel}>
                Warranty / Batch Expiry Date (Optional, YYYY-MM-DD)
              </Text>
              <TextInput
                style={styles.textInput}
                value={expiryDate}
                onChangeText={setExpiryDate}
                placeholder="e.g. 2027-10-15"
              />

              <TouchableOpacity style={styles.saveProductBtn} onPress={handleSaveProduct}>
                <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveProductBtnText}>
                  {editingProduct ? 'Save Changes' : 'Create Product & Generate QR Code'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* QR STICKER & PRINTING MODAL */}
      <Modal
        visible={Boolean(qrModalProduct)}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {qrModalProduct && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalHeaderTitle}>Product QR Label & Printing</Text>
                  <TouchableOpacity onPress={() => setQrModalProduct(null)}>
                    <Ionicons name="close" size={24} color="#0F172A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.qrModalBody}>
                  <View style={styles.stickerPreviewCard}>
                    <Text style={styles.stickerPreviewName}>{qrModalProduct.name}</Text>
                    <View style={{ marginVertical: 12 }}>
                      <DesignerQrCode
                        value={qrModalProduct.qrCode}
                        size={165}
                      />
                    </View>
                    <Text style={styles.stickerPreviewCode}>{qrModalProduct.qrCode}</Text>
                    <Text style={styles.stickerPreviewPrice}>
                      £{qrModalProduct.sellingPrice.toFixed(2)}
                    </Text>
                  </View>

                  <Text style={styles.stickerHelpText}>
                    One QR code per product — print and stick it on each unit. Works with Bluetooth thermal label printers or standard A4 sticker sheets.
                  </Text>

                  <TouchableOpacity
                    style={styles.printSingleBtn}
                    onPress={() => triggerLabelPrint(qrModalProduct, 'SINGLE')}
                  >
                    <Ionicons name="pricetag-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.printSingleBtnText}>
                      Print Single Sticker (Bluetooth Label Printer)
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.a4PrintBox}>
                    <View style={styles.a4CountRow}>
                      <Text style={styles.a4CountLabel}>Stickers on A4 Sheet:</Text>
                      <TextInput
                        style={styles.a4CountInput}
                        keyboardType="number-pad"
                        value={sheetCopiesCount}
                        onChangeText={setSheetCopiesCount}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.printSheetBtn}
                      onPress={() => triggerLabelPrint(qrModalProduct, 'A4_SHEET')}
                    >
                      <Ionicons name="grid-outline" size={18} color="#0F766E" />
                      <Text style={styles.printSheetBtnText}>
                        Print Full A4 Sheet ({parseInt(sheetCopiesCount, 10) || 24} Copies)
                      </Text>
                    </TouchableOpacity>
                  </View>
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
  topSearchRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  categoryScrollWrap: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  categoryRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  categoryChipActive: {
    backgroundColor: '#0F766E',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 28,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  categoryTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expiryTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B45309',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  qrPreviewBox: {
    alignItems: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  qrPrintHint: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F766E',
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metricBlock: {
    alignItems: 'flex-start',
  },
  metricBlockRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
    gap: 6,
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionBtnDanger: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
    marginTop: 8,
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 18,
    marginBottom: 24,
    gap: 8,
  },
  saveProductBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  qrModalBody: {
    padding: 18,
    alignItems: 'center',
  },
  stickerPreviewCard: {
    width: 240,
    alignItems: 'center',
    padding: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#94A3B8',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  stickerPreviewName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  stickerPreviewCode: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#475569',
  },
  stickerPreviewPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F766E',
    marginTop: 4,
  },
  stickerHelpText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginVertical: 14,
  },
  printSingleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  printSingleBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  a4PrintBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  a4CountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  a4CountLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  a4CountInput: {
    width: 70,
    height: 36,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    textAlign: 'center',
    fontWeight: '700',
    backgroundColor: '#FFFFFF',
  },
  printSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0F766E',
    gap: 8,
  },
  printSheetBtnText: {
    color: '#0F766E',
    fontWeight: '800',
    fontSize: 13,
  },
});
