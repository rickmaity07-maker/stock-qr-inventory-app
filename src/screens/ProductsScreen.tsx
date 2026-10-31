import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currencySymbol } from '../logic/money';
import { useInventory } from '../context/InventoryContext';
import { Product } from '../types/inventory';
import { printProductQrLabels } from '../utils/printAndExport';
import { DesignerQrCode } from '../components/DesignerQrCode';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  LargeTitle,
  Notice,
  Row,
  SearchField,
  Section,
  Sheet,
  Tap,
} from '../ui/components';
import { SyncIndicator } from '../ui/nav';
import { confirmAction, showAlert } from '../ui/dialog';
import { formatMoney, radius, space, tabular, type, usePalette } from '../ui/theme';
import { isValidIsoDate, parseNonNegativeNumber, parseWholeNumber } from '../logic/inventoryLogic';

interface Draft {
  name: string;
  category: string;
  buyingPrice: string;
  sellingPrice: string;
  quantity: string;
  minStockLevel: string;
  factoryBarcode: string;
  expiryDate: string;
}

const emptyDraft: Draft = {
  name: '',
  category: '',
  buyingPrice: '',
  sellingPrice: '',
  quantity: '0',
  minStockLevel: '5',
  factoryBarcode: '',
  expiryDate: '',
};

function validate(d: Draft) {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) errors.name = 'Enter a product name';
  if (parseNonNegativeNumber(d.buyingPrice || '0') === null) errors.buyingPrice = 'Enter a price like 12.50';
  if (parseNonNegativeNumber(d.sellingPrice) === null) errors.sellingPrice = 'Enter a price like 19.99';
  if (parseWholeNumber(d.quantity) === null) errors.quantity = 'Whole number, 0 or more';
  if (parseWholeNumber(d.minStockLevel) === null) errors.minStockLevel = 'Whole number, 0 or more';
  if (d.expiryDate.trim() && !isValidIsoDate(d.expiryDate.trim())) errors.expiryDate = 'Use YYYY-MM-DD';
  return errors;
}

export default function ProductsScreen() {
  const c = usePalette();
  const { products, role, isClientDemoLocked, isSampleData, addProduct, updateProduct, deleteProduct, getProduct } =
    useInventory();
  const isOwner = role === 'OWNER' && !isClientDemoLocked;

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copies, setCopies] = useState('24');

  const detail = detailId ? getProduct(detailId) ?? null : null;

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()],
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => category === 'All' || p.category === category)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.qrCode.toLowerCase().includes(q) ||
          (p.factoryBarcode || '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query, category]);

  const locked = (what: string) => {
    showAlert('Locked in preview mode', `${what} is available in the full version.`);
  };

  const openAdd = () => {
    if (isClientDemoLocked) return locked('Adding products');
    setDraft({ ...emptyDraft, category: category !== 'All' ? category : '' });
    setShowErrors(false);
    setEditing({ id: null });
  };

  const openEdit = (p: Product) => {
    if (isClientDemoLocked) return locked('Editing products');
    setDraft({
      name: p.name,
      category: p.category,
      buyingPrice: p.buyingPrice.toFixed(2),
      sellingPrice: p.sellingPrice.toFixed(2),
      quantity: String(Math.max(0, p.quantity)),
      minStockLevel: String(p.minStockLevel),
      factoryBarcode: p.factoryBarcode || '',
      expiryDate: p.expiryDate || '',
    });
    setShowErrors(false);
    setDetailId(null);
    setEditing({ id: p.id });
  };

  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const err = (k: keyof Draft) => (showErrors ? errors[k] : undefined);
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!editing || saving) return;
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const values = {
      name: draft.name.trim(),
      category: draft.category.trim() || 'General',
      buyingPrice: parseNonNegativeNumber(draft.buyingPrice || '0') ?? 0,
      sellingPrice: parseNonNegativeNumber(draft.sellingPrice) ?? 0,
      quantity: parseWholeNumber(draft.quantity) ?? 0,
      minStockLevel: parseWholeNumber(draft.minStockLevel) ?? 0,
      factoryBarcode: draft.factoryBarcode.trim(),
      expiryDate: draft.expiryDate.trim(),
    };
    setSaving(true);
    try {
      if (editing.id) {
        await updateProduct(editing.id, values);
        setEditing(null);
        setDetailId(editing.id);
      } else {
        const created = await addProduct({
          ...values,
          factoryBarcode: values.factoryBarcode || undefined,
          expiryDate: values.expiryDate || undefined,
        });
        setEditing(null);
        setDetailId(created.id);
      }
    } catch (e) {
      showAlert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (isClientDemoLocked) return locked('Deleting products');
    const ok = await confirmAction({
      title: `Delete ${p.name}?`,
      message: 'It disappears from the catalogue and scanner. Past sales stay in your reports.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteProduct(p.id);
    setDetailId(null);
  };

  const print = async (p: Product, mode: 'SINGLE' | 'A4_SHEET') => {
    if (isClientDemoLocked) return locked('Printing labels');
    try {
      await printProductQrLabels(p, mode, Math.min(96, Math.max(1, parseInt(copies, 10) || 24)));
    } catch (e) {
      showAlert('Could not print', e instanceof Error ? e.message : String(e));
    }
  };

  const existingCategories = categories.filter((x) => x !== 'All');

  const listHeader = (
    <View>
      <LargeTitle
        title="Products"
        subtitle={`${products.length} ${products.length === 1 ? 'product' : 'products'}`}
        accessory={
          isOwner ? (
            <Tap
              onPress={openAdd}
              accessibilityRole="button"
              accessibilityLabel="Add product"
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.tintSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <Ionicons name="add" size={24} color={c.tint} />
            </Tap>
          ) : (
            <SyncIndicator />
          )
        }
      />

      {isSampleData && isOwner ? (
        <Notice
          tone="indigo"
          icon="sparkles-outline"
          title="You're looking at sample products"
          message="Explore freely. When you're ready, start your own catalogue in Settings → Data."
        />
      ) : null}

      <View style={{ marginTop: space.sm }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search name, QR or barcode" />
      </View>

      {categories.length > 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.md }}
        >
          {categories.map((cat) => {
            const on = cat === category;
            return (
              <Tap
                key={cat}
                onPress={() => setCategory(cat)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: 14,
                  height: 32,
                  justifyContent: 'center',
                  borderRadius: 16,
                  backgroundColor: on ? c.label : c.surface,
                }}
              >
                <Text style={[type.subhead, { color: on ? c.background : c.label, fontWeight: on ? '600' : '400' }]}>{cat}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      ) : null}

    </View>
  );

  const last = filtered.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: space.xl }}
        ListEmptyComponent={
          <EmptyState
            icon={products.length ? 'search' : 'pricetags-outline'}
            title={products.length ? 'No matches' : 'No products yet'}
            message={products.length ? 'Try another search or category.' : 'Add your first product to get its QR sticker.'}
            action={!products.length && isOwner ? { label: 'Add product', onPress: openAdd } : undefined}
          />
        }
        renderItem={({ item: p, index }) => (
          <View
            style={{
              marginHorizontal: space.lg,
              overflow: 'hidden',
              backgroundColor: c.surface,
              borderTopLeftRadius: index === 0 ? radius.md : 0,
              borderTopRightRadius: index === 0 ? radius.md : 0,
              borderBottomLeftRadius: index === last ? radius.md : 0,
              borderBottomRightRadius: index === last ? radius.md : 0,
            }}
          >
            {index > 0 ? <View style={{ height: 0.5, backgroundColor: c.separator, marginLeft: space.lg }} /> : null}
            <Row
              title={p.name}
              subtitle={`${p.category} · ${formatMoney(p.sellingPrice)}`}
              onPress={() => setDetailId(p.id)}
              chevron
              left={<DesignerQrCode value={p.qrCode} size={40} />}
              right={
                <Badge
                  text={p.quantity <= 0 ? 'Out' : `${p.quantity}`}
                  tone={p.quantity <= 0 ? 'red' : p.quantity <= p.minStockLevel ? 'orange' : 'gray'}
                />
              }
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        maxToRenderPerBatch={20}
        windowSize={9}
      />

      {/* Product detail */}
      <Sheet
        visible={Boolean(detail)}
        title="Product"
        onClose={() => setDetailId(null)}
        closeLabel="Done"
        action={isOwner && detail ? { label: 'Edit', onPress: () => openEdit(detail) } : undefined}
        tall
      >
        {detail ? (
          <>
            <View style={{ alignItems: 'center', paddingTop: space.md, gap: 6, paddingHorizontal: space.lg }}>
              <View style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: radius.xl }}>
                <DesignerQrCode value={detail.qrCode} size={170} />
              </View>
              <Text style={[type.title3, { color: c.label, textAlign: 'center', marginTop: space.sm }]}>{detail.name}</Text>
              <Text style={[type.footnote, tabular, { color: c.secondaryLabel }]}>{detail.qrCode}</Text>
            </View>
            <Section>
              <Row title="Category" value={detail.category} />
              <Row title="Selling price" value={formatMoney(detail.sellingPrice)} />
              {role === 'OWNER' ? <Row title="Buying price" value={formatMoney(detail.buyingPrice)} /> : null}
              {role === 'OWNER' && detail.sellingPrice > 0 ? (
                <Row
                  title="Margin"
                  value={`${(((detail.sellingPrice - detail.buyingPrice) / detail.sellingPrice) * 100).toFixed(1)}%`}
                />
              ) : null}
              <Row title="In stock" value={String(detail.quantity)} />
              <Row title="Low-stock alert at" value={String(detail.minStockLevel)} />
              <Row title="Factory barcode" value={detail.factoryBarcode || 'None'} />
              <Row title="Expiry" value={detail.expiryDate || 'None'} />
            </Section>
            <Section
              header="Print QR stickers"
              footer="One code per product — stick the same code on every unit. Works with thermal label printers and A4 sticker sheets."
            >
              <Row title="Single label" left={<Ionicons name="pricetag-outline" size={20} color={c.tint} />} tinted onPress={() => print(detail, 'SINGLE')} />
              <Field label="Copies on the A4 sheet" value={copies} onChangeText={(t) => setCopies(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
              <Row
                title={`Print A4 sheet (${Math.min(96, Math.max(1, parseInt(copies, 10) || 24))})`}
                left={<Ionicons name="grid-outline" size={20} color={c.tint} />}
                tinted
                onPress={() => print(detail, 'A4_SHEET')}
              />
            </Section>
            {isOwner ? (
              <Section>
                <Row title="Delete product" destructive onPress={() => remove(detail)} />
              </Section>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* Add / edit */}
      <Sheet
        visible={Boolean(editing)}
        title={editing?.id ? 'Edit product' : 'New product'}
        onClose={() => setEditing(null)}
        action={{ label: editing?.id ? 'Save' : 'Add', onPress: save, loading: saving }}
        tall
      >
        <Section>
          <Field label="Name" value={draft.name} onChangeText={set('name')} placeholder="e.g. iPhone 16 Pro 256GB" error={err('name')} autoFocus={!editing?.id} />
          <Field label="Category" value={draft.category} onChangeText={set('category')} placeholder="General" />
        </Section>
        {existingCategories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xl, gap: 6, paddingTop: space.sm }}>
            {existingCategories.map((cat) => (
              <Tap key={cat} onPress={() => set('category')(cat)} style={{ paddingHorizontal: 10, height: 28, justifyContent: 'center', borderRadius: 14, backgroundColor: c.fill }}>
                <Text style={[type.footnote, { color: c.label }]}>{cat}</Text>
              </Tap>
            ))}
          </ScrollView>
        ) : null}
        <Section header="Prices">
          <Field label="Selling price" value={draft.sellingPrice} onChangeText={set('sellingPrice')} keyboardType="decimal-pad" placeholder="0.00" suffix={currencySymbol()} error={err('sellingPrice')} />
          <Field label="Buying price" value={draft.buyingPrice} onChangeText={set('buyingPrice')} keyboardType="decimal-pad" placeholder="0.00" suffix={currencySymbol()} error={err('buyingPrice')} />
        </Section>
        <Section
          header="Stock"
          footer={editing?.id ? 'Changing the count records a stock correction so every paired phone agrees.' : undefined}
        >
          <Field label={editing?.id ? 'Units in stock (counted)' : 'Starting stock'} value={draft.quantity} onChangeText={set('quantity')} keyboardType="number-pad" error={err('quantity')} />
          <Field label="Low-stock alert at" value={draft.minStockLevel} onChangeText={set('minStockLevel')} keyboardType="number-pad" error={err('minStockLevel')} />
        </Section>
        <Section header="Optional" footer="Link the maker's barcode to scan the box directly without a sticker.">
          <Field label="Factory barcode" value={draft.factoryBarcode} onChangeText={set('factoryBarcode')} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. 5012345678900" />
          <Field label="Expiry or warranty date" value={draft.expiryDate} onChangeText={set('expiryDate')} placeholder="YYYY-MM-DD" autoCapitalize="none" error={err('expiryDate')} />
        </Section>
        <View style={{ padding: space.lg }}>
          <Button title={editing?.id ? 'Save changes' : 'Add product and create QR'} onPress={save} loading={saving} />
        </View>
      </Sheet>
    </View>
  );
}
