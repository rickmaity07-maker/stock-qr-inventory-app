import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { currencySymbol } from '../logic/money';
import { InventoryError, useInventory } from '../context/InventoryContext';
import { Product, ScannerMode } from '../types/inventory';
import { DesignerQrCode } from '../components/DesignerQrCode';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  LargeTitle,
  Notice,
  Row,
  Screen,
  SearchField,
  Section,
  SegmentedControl,
  Sheet,
  Stepper,
  Tap,
  haptic,
} from '../ui/components';
import { SyncIndicator } from '../ui/nav';
import { showAlert } from '../ui/dialog';
import { formatMoney, radius, space, tabular, type, usePalette } from '../ui/theme';
import {
  isValidIsoDate,
  parseNonNegativeNumber,
  parsePairingPayload,
  PAIRING_PREFIX,
} from '../logic/inventoryLogic';

const MODES: { value: ScannerMode; label: string }[] = [
  { value: 'SELL', label: 'Sell' },
  { value: 'RESTOCK', label: 'Restock' },
  { value: 'INFO', label: 'Info' },
];

const MODE_HINT: Record<ScannerMode, string> = {
  SELL: 'Scanning takes items out of stock and records a sale.',
  RESTOCK: 'Scanning adds incoming items to stock.',
  INFO: 'Scanning only shows details. Nothing changes.',
};

type Feedback = { title: string; detail: string; tone: 'green' | 'orange' | 'tint' } | null;

export default function ScannerScreen() {
  const c = usePalette();
  const {
    products,
    transactions,
    role,
    scannerMode,
    setScannerMode,
    findProductByCode,
    getProduct,
    recordSale,
    recordRestock,
    linkFactoryBarcode,
    joinStoreSync,
    isClientDemoLocked,
    consumeDemoAction,
  } = useInventory();

  const modeColor = scannerMode === 'SELL' ? c.tint : scannerMode === 'RESTOCK' ? c.indigo : c.orange;

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [bigQr, setBigQr] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [qty, setQty] = useState('1');
  const [buyPrice, setBuyPrice] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // Always show the live product (stock may change on another phone while the sheet is open)
  const active = activeId ? getProduct(activeId) ?? null : null;
  const sheetOpen = Boolean(activeId || unknownCode || pairingCode);

  const openProduct = useCallback(
    (p: Product) => {
      haptic('success');
      setActiveId(p.id);
      setQty(scannerMode === 'RESTOCK' ? '10' : '1');
      setBuyPrice(p.buyingPrice.toFixed(2));
      setExpiry(p.expiryDate || '');
    },
    [scannerMode]
  );

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      const code = String(data || '').trim();
      if (!code || sheetOpen) return;
      // ignore the same code read again within 2 seconds (camera keeps seeing it)
      const now = Date.now();
      if (lastScan.current.code === code && now - lastScan.current.at < 2000) return;
      lastScan.current = { code, at: now };

      if (code.toUpperCase().startsWith(PAIRING_PREFIX)) {
        const parsed = parsePairingPayload(code);
        if (parsed) {
          haptic('success');
          setPairingCode(code);
          return;
        }
      }
      const found = findProductByCode(code);
      if (found) openProduct(found);
      else {
        haptic('warning');
        setUnknownCode(code);
      }
    },
    [sheetOpen, findProductByCode, openProduct]
  );

  const closeSheets = () => {
    setActiveId(null);
    setUnknownCode(null);
    setPairingCode(null);
    lastScan.current = { code: lastScan.current.code, at: Date.now() };
  };

  const demoBlocked = () => {
    if (isClientDemoLocked && !consumeDemoAction()) {
      closeSheets();
      showAlert('Demo limit reached', 'All demo scans are used. Unlock the full version in Settings.');
      return true;
    }
    return false;
  };

  const qtyNumber = Math.max(0, parseInt(qty, 10) || 0);

  const confirmSale = async () => {
    if (!active || busy) return;
    if (qtyNumber < 1) return;
    if (demoBlocked()) return;
    setBusy(true);
    try {
      const { product, lowStockTriggered } = await recordSale(active.id, qtyNumber);
      haptic(lowStockTriggered ? 'warning' : 'success');
      setFeedback({
        title: `Sold ${qtyNumber} × ${product.name}`,
        detail: lowStockTriggered
          ? `Low stock: ${product.quantity} left (alert at ${product.minStockLevel}).`
          : `${formatMoney(qtyNumber * product.sellingPrice)} · ${product.quantity} left in stock`,
        tone: lowStockTriggered ? 'orange' : 'green',
      });
      closeSheets();
    } catch (err) {
      haptic('error');
      showAlert('Sale not recorded', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const priceValue = parseNonNegativeNumber(buyPrice);
  const priceError = buyPrice.trim() && priceValue === null ? 'Enter a price like 12.50' : null;
  const expiryError = expiry.trim() && !isValidIsoDate(expiry.trim()) ? 'Use YYYY-MM-DD, e.g. 2027-06-30' : null;

  const confirmRestock = async () => {
    if (!active || busy || qtyNumber < 1 || priceError || expiryError) return;
    if (demoBlocked()) return;
    setBusy(true);
    try {
      const updated = await recordRestock(
        active.id,
        qtyNumber,
        priceValue ?? active.buyingPrice,
        expiry.trim() || undefined
      );
      haptic('success');
      setFeedback({
        title: `Added ${qtyNumber} × ${updated.name}`,
        detail: `${updated.quantity} in stock now`,
        tone: 'green',
      });
      closeSheets();
    } catch (err) {
      showAlert('Restock not recorded', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const linkBarcode = async (p: Product) => {
    if (!unknownCode || busy) return;
    if (isClientDemoLocked) {
      showAlert('Locked in preview mode', 'Linking barcodes is available in the full version.');
      return;
    }
    setBusy(true);
    try {
      await linkFactoryBarcode(p.id, unknownCode);
      setFeedback({ title: `Barcode linked to ${p.name}`, detail: 'Scan it any time — no sticker needed.', tone: 'tint' });
      closeSheets();
    } catch (err) {
      showAlert('Could not link barcode', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const joinStore = async () => {
    if (!pairingCode) return;
    if (role !== 'OWNER' || isClientDemoLocked) {
      showAlert('Owner only', 'Unlock owner mode in Settings to pair this phone with a store.');
      return;
    }
    const res = await joinStoreSync(pairingCode);
    closeSheets();
    showAlert(res.ok ? 'Phone paired' : 'Could not pair', res.message);
  };

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.qrCode.toLowerCase().includes(q) ||
            (p.factoryBarcode || '').toLowerCase().includes(q)
        )
      : products;
    return list.slice(0, 60);
  }, [products, query]);

  const history = useMemo(
    () => (active ? transactions.filter((t) => t.productId === active.id).slice(0, 8) : []),
    [active, transactions]
  );

  const camera = () => {
    if (!permission) {
      return <Text style={[type.subhead, { color: c.secondaryLabel }]}>Checking camera access…</Text>;
    }
    if (!permission.granted) {
      return (
        <View style={{ alignItems: 'center', gap: space.sm, padding: space.xl }}>
          <Ionicons name="camera-outline" size={40} color="#FFFFFF" />
          <Text style={[type.headline, { color: '#FFFFFF', textAlign: 'center' }]}>Camera access is off</Text>
          <Text style={[type.footnote, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>
            {permission.canAskAgain
              ? 'Allow the camera to scan QR stickers and barcodes.'
              : Platform.OS === 'web'
              ? 'Allow camera access for this site in Safari settings, then reopen the app.'
              : 'Turn on camera access for this app in your phone settings.'}
          </Text>
          {permission.canAskAgain ? (
            <Button title="Allow camera" onPress={requestPermission} size="medium" style={{ marginTop: space.sm }} />
          ) : null}
        </View>
      );
    }
    if (!cameraOn) {
      return (
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Ionicons name="pause-circle-outline" size={40} color="#FFFFFF" />
          <Button title="Resume camera" onPress={() => setCameraOn(true)} size="medium" variant="tinted" color="#FFFFFF" />
        </View>
      );
    }
    return (
      <>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
          }}
          onBarcodeScanned={sheetOpen ? undefined : handleScanned}
        />
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={[styles.reticle, { borderColor: modeColor }]} />
        </View>
      </>
    );
  };

  return (
    <Screen>
      <LargeTitle title="Scan" accessory={<SyncIndicator />} />

      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <SegmentedControl options={MODES} value={scannerMode} onChange={setScannerMode} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: modeColor }} />
          <Text style={[type.footnote, { color: c.secondaryLabel, flex: 1 }]}>{MODE_HINT[scannerMode]}</Text>
        </View>
      </View>

      {feedback ? (
        <Notice
          tone={feedback.tone}
          icon={feedback.tone === 'orange' ? 'warning' : 'checkmark-circle'}
          title={feedback.title}
          message={feedback.detail}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <View style={[styles.camera, { borderColor: modeColor }]}>
        {camera()}
        {permission?.granted ? (
          <Tap
            onPress={() => setCameraOn((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={cameraOn ? 'Pause camera' : 'Start camera'}
            style={styles.camToggle}
          >
            <Ionicons name={cameraOn ? 'pause' : 'play'} size={16} color="#FFFFFF" />
          </Tap>
        ) : null}
        <View style={[styles.modeTag, { backgroundColor: modeColor }]}>
          <Text style={[type.caption1, { color: '#FFFFFF', fontWeight: '600' }]}>
            {MODES.find((m) => m.value === scannerMode)?.label} mode
          </Text>
        </View>
      </View>
      {Platform.OS === 'web' ? (
        <Text style={[type.footnote, { color: c.secondaryLabel, marginHorizontal: space.xl, marginTop: space.sm }]}>
          On iPhone the web app reads QR stickers. Use the list below for factory barcodes.
        </Text>
      ) : null}

      <Section header="Or pick a product">
        <View style={{ paddingVertical: space.sm, backgroundColor: c.surface }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search name or code" />
        </View>
        {listed.length === 0 ? (
          <EmptyState
            icon="search"
            title={products.length ? 'No matches' : 'No products yet'}
            message={products.length ? 'Try a different name or code.' : 'Add products in the Products tab.'}
          />
        ) : (
          listed.map((p) => (
            <Row
              key={p.id}
              title={p.name}
              subtitle={`${p.qrCode} · ${formatMoney(p.sellingPrice)}`}
              onPress={() => openProduct(p)}
              left={
                <Tap onPress={() => setBigQr(p)} accessibilityLabel={`Show QR code for ${p.name}`} hitSlop={4}>
                  <DesignerQrCode value={p.qrCode} size={40} />
                </Tap>
              }
              right={
                <Badge
                  text={p.quantity <= 0 ? 'Out' : `${p.quantity}`}
                  tone={p.quantity <= 0 ? 'red' : p.quantity <= p.minStockLevel ? 'orange' : 'gray'}
                />
              }
            />
          ))
        )}
      </Section>

      {/* Product action sheet */}
      <Sheet
        visible={Boolean(activeId)}
        title={scannerMode === 'SELL' ? 'Sell' : scannerMode === 'RESTOCK' ? 'Restock' : 'Product info'}
        onClose={closeSheets}
        closeLabel={scannerMode === 'INFO' ? 'Done' : 'Cancel'}
      >
        {active ? (
          <>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Text style={[type.title2, { color: c.label }]}>{active.name}</Text>
              <Text style={[type.subhead, { color: c.secondaryLabel, marginTop: 2 }]}>
                {active.category} · {active.quantity} in stock
              </Text>
            </View>

            {scannerMode === 'SELL' ? (
              active.quantity <= 0 ? (
                <EmptyState
                  icon="alert-circle-outline"
                  title="Out of stock"
                  message="Restock this product before selling it."
                  action={{ label: 'Switch to Restock', onPress: () => { setScannerMode('RESTOCK'); setQty('10'); } }}
                />
              ) : (
                <View style={{ padding: space.lg, gap: space.lg }}>
                  <Stepper value={qty} onChange={setQty} min={1} max={active.quantity} />
                  <View style={styles.totalRow}>
                    <Text style={[type.body, { color: c.secondaryLabel }]}>
                      {qtyNumber || 0} × {formatMoney(active.sellingPrice)}
                    </Text>
                    <Text style={[type.title2, tabular, { color: c.label }]}>
                      {formatMoney((qtyNumber || 0) * active.sellingPrice)}
                    </Text>
                  </View>
                  {qtyNumber > active.quantity ? (
                    <Text style={[type.footnote, { color: c.red }]}>Only {active.quantity} in stock.</Text>
                  ) : null}
                  <Button
                    title={`Confirm sale`}
                    icon="checkmark-circle"
                    onPress={confirmSale}
                    loading={busy}
                    disabled={qtyNumber < 1 || qtyNumber > active.quantity}
                  />
                </View>
              )
            ) : null}

            {scannerMode === 'RESTOCK' ? (
              <>
                <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
                  <Stepper value={qty} onChange={setQty} min={1} bigStep={10} />
                </View>
                <Section>
                  <Field
                    label="Buying price per unit"
                    value={buyPrice}
                    onChangeText={setBuyPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    suffix={currencySymbol()}
                    error={priceError}
                  />
                  <Field
                    label="Expiry or warranty date (optional)"
                    value={expiry}
                    onChangeText={setExpiry}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    error={expiryError}
                  />
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

            {scannerMode === 'INFO' ? (
              <>
                <View style={{ alignItems: 'center', paddingTop: space.lg, gap: 6 }}>
                  <DesignerQrCode value={active.qrCode} size={150} />
                  <Text style={[type.footnote, tabular, { color: c.secondaryLabel }]}>{active.qrCode}</Text>
                </View>
                <Section>
                  <Row title="Selling price" value={formatMoney(active.sellingPrice)} />
                  {role === 'OWNER' ? <Row title="Buying price" value={formatMoney(active.buyingPrice)} /> : null}
                  <Row title="In stock" value={`${active.quantity}`} />
                  <Row title="Low-stock alert at" value={`${active.minStockLevel}`} />
                  {active.factoryBarcode ? <Row title="Factory barcode" value={active.factoryBarcode} /> : null}
                  <Row title="Expiry" value={active.expiryDate || 'None'} />
                </Section>
                <Section header="Recent activity">
                  {history.length === 0 ? (
                    <Row title="No sales or restocks yet" />
                  ) : (
                    history.map((tx) => (
                      <Row
                        key={tx.id}
                        title={tx.type === 'SALE' ? `Sold ${tx.quantity}` : tx.type === 'RESTOCK' ? `Restocked ${tx.quantity}` : `Count corrected ${tx.quantity > 0 ? '+' : ''}${tx.quantity}`}
                        subtitle={new Date(tx.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        value={tx.type === 'SALE' ? formatMoney(tx.quantity * tx.unitSellingPrice) : undefined}
                      />
                    ))
                  )}
                </Section>
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* Unknown barcode → link it */}
      <Sheet visible={Boolean(unknownCode)} title="New barcode" onClose={closeSheets} tall>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <Text style={[type.headline, tabular, { color: c.label }]}>{unknownCode}</Text>
          <Text style={[type.subhead, { color: c.secondaryLabel, marginTop: 4 }]}>
            This code is not linked to a product yet. Pick the product it belongs to and you can scan it directly from now on.
          </Text>
        </View>
        <Section header="Link to">
          {products.length === 0 ? (
            <Row title="No products yet" />
          ) : (
            products.map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={p.factoryBarcode ? `Already linked: ${p.factoryBarcode}` : p.qrCode}
                onPress={() => linkBarcode(p)}
                right={<Ionicons name="link" size={18} color={c.tint} />}
              />
            ))
          )}
        </Section>
      </Sheet>

      {/* Pairing QR scanned */}
      <Sheet visible={Boolean(pairingCode)} title="Pair with store" onClose={closeSheets}>
        <EmptyState
          icon="sync-circle-outline"
          title="Join this store?"
          message="This phone will share stock, products and sales with the phone that showed this code. Products already on this phone are kept and shared too."
          action={{ label: 'Pair this phone', onPress: joinStore }}
        />
      </Sheet>

      {/* Big QR for phone-to-phone scanning */}
      <Sheet visible={Boolean(bigQr)} title={bigQr?.name || ''} onClose={() => setBigQr(null)} closeLabel="Done">
        {bigQr ? (
          <View style={{ alignItems: 'center', padding: space.xl, gap: space.md }}>
            <View style={{ backgroundColor: '#FFFFFF', padding: space.md, borderRadius: radius.xl }}>
              <DesignerQrCode value={bigQr.qrCode} size={240} />
            </View>
            <Text style={[type.headline, tabular, { color: c.label }]}>{bigQr.qrCode}</Text>
            <Text style={[type.footnote, { color: c.secondaryLabel, textAlign: 'center' }]}>
              Hold another phone over this code to scan it.
            </Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: {
    height: 300,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 190, height: 190, borderWidth: 3, borderRadius: 24, opacity: 0.9 },
  camToggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTag: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
