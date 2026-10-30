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
          <Ionicons name="search" size={18} color="#8E8E93" />
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
                      <Text style={[styles.metricValue, { color: '#34C759' }]}>
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
                      { color: isLowStock ? '#FF3B30' : '#000000' },
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
                  <Ionicons name="print-outline" size={16} color="#007AFF" />
                  <Text style={styles.actionBtnPrimaryText}>QR & Label Print</Text>
                </TouchableOpacity>

                {role === 'OWNER' && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={() => openEditModal(product)}
                    >
                      <Ionicons name="create-outline" size={16} color="#3A3A3C" />
                      <Text style={styles.actionBtnSecondaryText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnDanger}
                      onPress={() => handleDeleteProduct(product)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FF3B30" />
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
                <Ionicons name="close" size={24} color="#1C1C1E" />
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
                    <Ionicons name="close" size={24} color="#1C1C1E" />
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
                      <Ionicons name="grid-outline" size={18} color="#007AFF" />
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
    backgroundColor: '#F2F2F7',
  },
  topSearchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  searchInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#000000',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    borderRadius: 999,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  categoryScrollWrap: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  categoryRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F2F2F7',
  },
  categoryChipActive: {
    backgroundColor: '#000000',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 5,
  },
  categoryTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  expiryTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#C93400',
    backgroundColor: 'rgba(255, 149, 0, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.3,
  },
  qrSubtitle: {
    fontSize: 11.5,
    color: '#8E8E93',
    marginTop: 3,
  },
  qrPreviewBox: {
    alignItems: 'center',
    padding: 7,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
  },
  qrPrintHint: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  metricBlock: {
    alignItems: 'flex-start',
  },
  metricBlockRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 10.5,
    color: '#8E8E93',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnPrimaryText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#007AFF',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },
  actionBtnSecondaryText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  actionBtnDanger: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    paddingHorizontal: 11,
    borderRadius: 10,
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.3,
  },
  modalBody: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    height: 44,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#000000',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 20,
    marginBottom: 24,
    gap: 8,
  },
  saveProductBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  qrModalBody: {
    padding: 20,
    alignItems: 'center',
  },
  stickerPreviewCard: {
    width: 246,
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  stickerPreviewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  stickerPreviewCode: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#636366',
  },
  stickerPreviewPrice: {
    fontSize: 19,
    fontWeight: '700',
    color: '#007AFF',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  stickerHelpText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginVertical: 14,
    lineHeight: 18,
  },
  printSingleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginBottom: 12,
  },
  printSingleBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  a4PrintBox: {
    width: '100%',
    backgroundColor: '#F2F2F7',
    padding: 14,
    borderRadius: 16,
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
    color: '#3A3A3C',
  },
  a4CountInput: {
    width: 70,
    height: 36,
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: '700',
    backgroundColor: '#FFFFFF',
  },
  printSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  printSheetBtnText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 13.5,
  },
});
