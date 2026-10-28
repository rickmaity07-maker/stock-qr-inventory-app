import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../../src/context/InventoryContext';
import { Product, ScannerMode } from '../../src/types/inventory';
import { DesignerQrCode } from '../../src/components/DesignerQrCode';

const MODE_CONFIG: Record<
  ScannerMode,
  {
    label: string;
    subtitle: string;
    accentColor: string;
    bgColor: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  SELL: {
    label: 'Sell Mode',
    subtitle: 'Scan sticker → confirm quantity (defaults to 1) → stock goes down & sale recorded',
    accentColor: '#0F766E',
    bgColor: '#F0FDFA',
    icon: 'cart-outline',
  },
  RESTOCK: {
    label: 'Restock Mode',
    subtitle: 'Scan incoming goods → enter quantity & buying price → stock goes up',
    accentColor: '#1D4ED8',
    bgColor: '#EFF6FF',
    icon: 'add-circle-outline',
  },
  INFO: {
    label: 'Info Mode',
    subtitle: 'Scan to view product details, current stock & sales history without changing anything',
    accentColor: '#B45309',
    bgColor: '#FFFBEB',
    icon: 'information-circle-outline',
  },
};

export default function ScannerScreen() {
  const {
    products,
    transactions,
    role,
    scannerMode,
    setScannerMode,
    findProductByCode,
    recordSale,
    recordRestock,
    linkFactoryBarcode,
  } = useInventory();

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [unrecognizedBarcode, setUnrecognizedBarcode] = useState<string | null>(null);

  // Sell / Restock form states
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [buyingPriceStr, setBuyingPriceStr] = useState<string>('');
  const [expiryDateStr, setExpiryDateStr] = useState<string>('');
  const [notesStr, setNotesStr] = useState<string>('');
  const [lastFeedbackBanner, setLastFeedbackBanner] = useState<{
    title: string;
    detail: string;
    isWarning?: boolean;
  } | null>(null);

  const activeConfig = MODE_CONFIG[scannerMode];

  const openProductActionSheet = useCallback(
    (product: Product) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setScannedProduct(product);
      setQuantityStr(scannerMode === 'SELL' ? '1' : '10');
      setBuyingPriceStr(product.buyingPrice.toFixed(2));
      setExpiryDateStr(product.expiryDate || '');
      setNotesStr('');
    },
    [scannerMode]
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scannedProduct || unrecognizedBarcode) return;
      const found = findProductByCode(data);
      if (found) {
        openProductActionSheet(found);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setUnrecognizedBarcode(data.trim());
      }
    },
    [scannedProduct, unrecognizedBarcode, findProductByCode, openProductActionSheet]
  );

  const handleConfirmSale = async () => {
    if (!scannedProduct) return;
    const qty = Math.max(1, parseInt(quantityStr, 10) || 1);
    if (qty > scannedProduct.quantity) {
      Alert.alert(
        'Insufficient Stock',
        `Only ${scannedProduct.quantity} units of "${scannedProduct.name}" are currently in stock. Proceed anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Record Sale Anyway',
            style: 'destructive',
            onPress: () => executeSale(scannedProduct, qty),
          },
        ]
      );
      return;
    }
    await executeSale(scannedProduct, qty);
  };

  const executeSale = async (product: Product, qty: number) => {
    const { product: updated, lowStockTriggered } = await recordSale(
      product.id,
      qty,
      notesStr.trim() || undefined
    );
    const totalSale = (qty * product.sellingPrice).toFixed(2);
    setScannedProduct(null);
    setLastFeedbackBanner({
      title: `Sold ${qty}× ${product.name} (£${totalSale})`,
      detail: lowStockTriggered
        ? `LOW STOCK ALERT: Only ${updated.quantity} left (Min level: ${updated.minStockLevel})`
        : `Remaining live stock: ${updated.quantity} units`,
      isWarning: lowStockTriggered,
    });
  };

  const handleConfirmRestock = async () => {
    if (!scannedProduct) return;
    const qty = Math.max(1, parseInt(quantityStr, 10) || 1);
    const buyPrice = parseFloat(buyingPriceStr);
    const validBuyPrice = !isNaN(buyPrice) && buyPrice >= 0 ? buyPrice : scannedProduct.buyingPrice;

    const updated = await recordRestock(
      scannedProduct.id,
      qty,
      validBuyPrice,
      expiryDateStr.trim() || undefined,
      notesStr.trim() || undefined
    );
    setScannedProduct(null);
    setLastFeedbackBanner({
      title: `Restocked +${qty}× ${updated.name}`,
      detail: `New live stock level: ${updated.quantity} units • Buying price: £${updated.buyingPrice.toFixed(2)}`,
      isWarning: false,
    });
  };

  const handleLinkUnknownBarcode = async (product: Product) => {
    if (!unrecognizedBarcode) return;
    await linkFactoryBarcode(product.id, unrecognizedBarcode);
    const code = unrecognizedBarcode;
    setUnrecognizedBarcode(null);
    setLastFeedbackBanner({
      title: `Barcode ${code} linked to ${product.name}`,
      detail: 'You can now scan the factory barcode directly without needing an extra sticker.',
    });
  };

  const productSalesHistory = scannedProduct
    ? transactions.filter((t) => t.productId === scannedProduct.id).slice(0, 8)
    : [];

  return (
    <View style={styles.container}>
      {/* MISTAKE-PROOF 3-WAY MODE SWITCH */}
      <View style={[styles.modeHeaderCard, { backgroundColor: activeConfig.bgColor }]}>
        <View style={styles.segmentedControl}>
          {(['SELL', 'RESTOCK', 'INFO'] as ScannerMode[]).map((m) => {
            const isSelected = scannerMode === m;
            const cfg = MODE_CONFIG[m];
            return (
              <TouchableOpacity
                key={m}
                style={[
                  styles.segmentButton,
                  isSelected && { backgroundColor: cfg.accentColor },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setScannerMode(m);
                }}
              >
                <Ionicons
                  name={cfg.icon}
                  size={16}
                  color={isSelected ? '#FFFFFF' : '#475569'}
                />
                <Text
                  style={[
                    styles.segmentButtonText,
                    isSelected && styles.segmentButtonTextActive,
                  ]}
                >
                  {m === 'SELL' ? 'Sell' : m === 'RESTOCK' ? 'Restock' : 'Info'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.modeBannerRow}>
          <View
            style={[styles.modeIndicatorDot, { backgroundColor: activeConfig.accentColor }]}
          />
          <Text style={[styles.modeSubtitle, { color: activeConfig.accentColor }]}>
            {activeConfig.subtitle}
          </Text>
        </View>
      </View>

      {/* INSTANT SCAN FEEDBACK BANNER */}
      {lastFeedbackBanner && (
        <View
          style={[
            styles.feedbackBanner,
            lastFeedbackBanner.isWarning
              ? styles.feedbackBannerWarn
              : styles.feedbackBannerSuccess,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.feedbackTitle}>{lastFeedbackBanner.title}</Text>
            <Text style={styles.feedbackDetail}>{lastFeedbackBanner.detail}</Text>
          </View>
          <TouchableOpacity onPress={() => setLastFeedbackBanner(null)}>
            <Ionicons name="close-circle" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* CAMERA VIEWPORT FOR QR & FACTORY BARCODES */}
      <View style={styles.cameraWrapper}>
        {!permission ? (
          <View style={styles.cameraFallback}>
            <Text style={styles.cameraFallbackText}>Checking camera permissions...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.cameraFallback}>
            <Ionicons name="camera-outline" size={44} color="#94A3B8" />
            <Text style={styles.cameraFallbackTitle}>Camera Access Needed for Scanning</Text>
            <Text style={styles.cameraFallbackText}>
              Grant camera permission to scan printed QR labels and factory barcodes.
            </Text>
            <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
              <Text style={styles.grantButtonText}>Enable Camera Scanner</Text>
            </TouchableOpacity>
          </View>
        ) : cameraActive ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
            }}
            onBarcodeScanned={
              scannedProduct || unrecognizedBarcode ? undefined : handleBarcodeScanned
            }
          >
            <View style={styles.scannerOverlay}>
              <View
                style={[
                  styles.reticleBox,
                  { borderColor: activeConfig.accentColor },
                ]}
              />
              <View
                style={[
                  styles.overlayModeTag,
                  { backgroundColor: activeConfig.accentColor },
                ]}
              >
                <Text style={styles.overlayModeTagText}>
                  {activeConfig.label.toUpperCase()} ACTIVE
                </Text>
              </View>
            </View>
          </CameraView>
        ) : (
          <View style={styles.cameraFallback}>
            <Ionicons name="pause-circle-outline" size={44} color="#94A3B8" />
            <Text style={styles.cameraFallbackTitle}>Camera Paused</Text>
            <TouchableOpacity
              style={styles.grantButton}
              onPress={() => setCameraActive(true)}
            >
              <Text style={styles.grantButtonText}>Resume Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {permission?.granted && (
          <TouchableOpacity
            style={styles.cameraToggleFab}
            onPress={() => setCameraActive((prev) => !prev)}
          >
            <Ionicons
              name={cameraActive ? 'videocam-off-outline' : 'videocam-outline'}
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.cameraToggleText}>
              {cameraActive ? 'Pause Cam' : 'Start Cam'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* QUICK SIMULATE SCAN / MANUAL TAP LIST */}
      <View style={styles.quickListSection}>
        <View style={styles.quickListHeader}>
          <Text style={styles.quickListTitle}>
            Tap a Product to Trigger {activeConfig.label}
          </Text>
          <Text style={styles.quickListSubtitle}>
            Works alongside camera scan
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.quickListScroll}>
          {products.map((item) => {
            const isLow = item.quantity <= item.minStockLevel;
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.quickProductRow}
                onPress={() => openProductActionSheet(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickProductName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.quickProductCode}>
                    QR: {item.qrCode}
                    {item.factoryBarcode ? ` • Barcode: ${item.factoryBarcode}` : ''}
                  </Text>
                </View>
                <View style={styles.quickRightMeta}>
                  <Text style={styles.quickPrice}>£{item.sellingPrice.toFixed(2)}</Text>
                  <View
                    style={[
                      styles.stockChip,
                      isLow ? styles.stockChipLow : styles.stockChipOk,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stockChipText,
                        isLow ? styles.stockChipTextLow : styles.stockChipTextOk,
                      ]}
                    >
                      {item.quantity} in stock
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* SCANNED PRODUCT MODAL (SELL / RESTOCK / INFO) */}
      <Modal
        visible={Boolean(scannedProduct)}
        transparent
        animationType="slide"
        onRequestClose={() => setScannedProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {scannedProduct && (
              <>
                <View
                  style={[
                    styles.modalTopBanner,
                    { backgroundColor: activeConfig.accentColor },
                  ]}
                >
                  <View style={styles.modalBannerTitleRow}>
                    <Ionicons name={activeConfig.icon} size={20} color="#FFFFFF" />
                    <Text style={styles.modalBannerTitle}>{activeConfig.label}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setScannedProduct(null)}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <Text style={styles.scannedItemName}>{scannedProduct.name}</Text>
                  <Text style={styles.scannedItemMeta}>
                    QR: {scannedProduct.qrCode} • Current Stock:{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {scannedProduct.quantity} units
                    </Text>
                  </Text>

                  {/* 1. SELL MODE SHEET */}
                  {scannerMode === 'SELL' && (
                    <View style={styles.formSection}>
                      <View style={styles.priceSummaryBox}>
                        <View>
                          <Text style={styles.priceBoxLabel}>Selling Price</Text>
                          <Text style={styles.priceBoxValue}>
                            £{scannedProduct.sellingPrice.toFixed(2)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.priceBoxLabel}>Total Sale</Text>
                          <Text style={[styles.priceBoxValue, { color: '#0F766E' }]}>
                            £
                            {(
                              (parseInt(quantityStr, 10) || 1) *
                              scannedProduct.sellingPrice
                            ).toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.fieldLabel}>Quantity Sold (Defaults to 1)</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => {
                            const curr = parseInt(quantityStr, 10) || 1;
                            setQuantityStr(String(Math.max(1, curr - 1)));
                          }}
                        >
                          <Ionicons name="remove" size={22} color="#0F172A" />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.stepperInput}
                          keyboardType="number-pad"
                          value={quantityStr}
                          onChangeText={setQuantityStr}
                        />
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => {
                            const curr = parseInt(quantityStr, 10) || 1;
                            setQuantityStr(String(curr + 1));
                          }}
                        >
                          <Ionicons name="add" size={22} color="#0F172A" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.primaryConfirmBtn,
                          { backgroundColor: '#0F766E' },
                        ]}
                        onPress={handleConfirmSale}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryConfirmBtnText}>
                          Confirm Sale (-{parseInt(quantityStr, 10) || 1} Stock)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* 2. RESTOCK MODE SHEET */}
                  {scannerMode === 'RESTOCK' && (
                    <View style={styles.formSection}>
                      <Text style={styles.fieldLabel}>Incoming Restock Quantity</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => {
                            const curr = parseInt(quantityStr, 10) || 1;
                            setQuantityStr(String(Math.max(1, curr - 1)));
                          }}
                        >
                          <Ionicons name="remove" size={22} color="#0F172A" />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.stepperInput}
                          keyboardType="number-pad"
                          value={quantityStr}
                          onChangeText={setQuantityStr}
                        />
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => {
                            const curr = parseInt(quantityStr, 10) || 1;
                            setQuantityStr(String(curr + 5));
                          }}
                        >
                          <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>+5</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.fieldLabel}>Unit Buying Price (£)</Text>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="decimal-pad"
                        value={buyingPriceStr}
                        onChangeText={setBuyingPriceStr}
                        placeholder="0.00"
                      />

                      <Text style={styles.fieldLabel}>
                        Expiry Date (Optional, YYYY-MM-DD)
                      </Text>
                      <TextInput
                        style={styles.textInput}
                        value={expiryDateStr}
                        onChangeText={setExpiryDateStr}
                        placeholder="e.g. 2027-06-30"
                      />

                      <TouchableOpacity
                        style={[
                          styles.primaryConfirmBtn,
                          { backgroundColor: '#1D4ED8' },
                        ]}
                        onPress={handleConfirmRestock}
                      >
                        <Ionicons name="arrow-up-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryConfirmBtnText}>
                          Confirm Restock (+{parseInt(quantityStr, 10) || 1} Stock)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* 3. INFO MODE SHEET (Read-Only Details & History) */}
                  {scannerMode === 'INFO' && (
                    <View style={styles.formSection}>
                      <View style={styles.infoQrCenter}>
                        <DesignerQrCode value={scannedProduct.qrCode} size={126} />
                        <Text style={styles.infoQrCaption}>{scannedProduct.qrCode}</Text>
                      </View>

                      <View style={styles.infoGrid}>
                        <View style={styles.infoBox}>
                          <Text style={styles.infoBoxLabel}>Selling Price</Text>
                          <Text style={styles.infoBoxValue}>
                            £{scannedProduct.sellingPrice.toFixed(2)}
                          </Text>
                        </View>
                        {role === 'OWNER' && (
                          <View style={styles.infoBox}>
                            <Text style={styles.infoBoxLabel}>Buying Price</Text>
                            <Text style={styles.infoBoxValue}>
                              £{scannedProduct.buyingPrice.toFixed(2)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.infoBox}>
                          <Text style={styles.infoBoxLabel}>Min Alert Level</Text>
                          <Text style={styles.infoBoxValue}>
                            {scannedProduct.minStockLevel} units
                          </Text>
                        </View>
                        <View style={styles.infoBox}>
                          <Text style={styles.infoBoxLabel}>Expiry Date</Text>
                          <Text style={styles.infoBoxValue}>
                            {scannedProduct.expiryDate || 'None'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.historyHeader}>Recent Activity for This Item</Text>
                      {productSalesHistory.length === 0 ? (
                        <Text style={styles.emptyHistoryText}>
                          No recorded sales or restocks yet.
                        </Text>
                      ) : (
                        productSalesHistory.map((tx) => (
                          <View key={tx.id} style={styles.historyRow}>
                            <View>
                              <Text style={styles.historyType}>
                                {tx.type === 'SALE' ? 'Sold' : 'Restocked'} {tx.quantity} units
                              </Text>
                              <Text style={styles.historyDate}>
                                {new Date(tx.timestamp).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.historyAmount,
                                {
                                  color: tx.type === 'SALE' ? '#0F766E' : '#1D4ED8',
                                },
                              ]}
                            >
                              {tx.type === 'SALE'
                                ? `£${(tx.quantity * tx.unitSellingPrice).toFixed(2)}`
                                : `+${tx.quantity} stock`}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* UNRECOGNIZED FACTORY BARCODE LINKING MODAL */}
      <Modal
        visible={Boolean(unrecognizedBarcode)}
        transparent
        animationType="fade"
        onRequestClose={() => setUnrecognizedBarcode(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalTopBanner, { backgroundColor: '#334155' }]}>
              <Text style={styles.modalBannerTitle}>
                Link Existing Factory Barcode
              </Text>
              <TouchableOpacity onPress={() => setUnrecognizedBarcode(null)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.scannedItemName}>
                Scanned Code: {unrecognizedBarcode}
              </Text>
              <Text style={styles.scannedItemMeta}>
                Tap any product below to link this factory barcode to it so no extra QR sticker is needed:
              </Text>
              {products.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.quickProductRow}
                  onPress={() => handleLinkUnknownBarcode(p)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickProductName}>{p.name}</Text>
                    <Text style={styles.quickProductCode}>QR: {p.qrCode}</Text>
                  </View>
                  <Ionicons name="link-outline" size={20} color="#0F766E" />
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  modeHeaderCard: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  segmentButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },
  modeBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  modeIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
  },
  feedbackBannerSuccess: {
    backgroundColor: '#0F766E',
  },
  feedbackBannerWarn: {
    backgroundColor: '#DC2626',
  },
  feedbackTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  feedbackDetail: {
    color: '#F1F5F9',
    fontSize: 11,
    marginTop: 2,
  },
  cameraWrapper: {
    height: 230,
    margin: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  scannerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  reticleBox: {
    width: 150,
    height: 150,
    borderWidth: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  overlayModeTag: {
    position: 'absolute',
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  overlayModeTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  cameraToggleFab: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 5,
  },
  cameraToggleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cameraFallbackTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  cameraFallbackText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  grantButton: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  grantButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  quickListSection: {
    flex: 1,
    paddingHorizontal: 12,
  },
  quickListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  quickListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  quickListSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  quickListScroll: {
    paddingBottom: 20,
    gap: 8,
  },
  quickProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  quickProductCode: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quickRightMeta: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  quickPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  stockChip: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stockChipOk: {
    backgroundColor: '#F0FDFA',
  },
  stockChipLow: {
    backgroundColor: '#FEF2F2',
  },
  stockChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stockChipTextOk: {
    color: '#0F766E',
  },
  stockChipTextLow: {
    color: '#DC2626',
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
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalTopBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalBody: {
    padding: 18,
  },
  scannedItemName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scannedItemMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 14,
  },
  formSection: {
    marginTop: 4,
    paddingBottom: 24,
  },
  priceSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  priceBoxLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  priceBoxValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 8,
  },
  primaryConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  primaryConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  infoQrCenter: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 12,
  },
  infoQrCaption: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#334155',
    marginTop: 6,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  infoBox: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoBoxLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  infoBoxValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  historyHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#64748B',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  historyDate: {
    fontSize: 11,
    color: '#64748B',
  },
  historyAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
});
