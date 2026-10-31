import { mapDbRowToProduct,mapProductToDbRow,mapDbRowToTransaction,mapTransactionToDbRow,explainSupabaseError } from '../src/services/supabase';
import { Product,StockTransaction } from '../src/types/inventory';
const product:Product={id:'p',name:'Phone',category:'Tech',qrCode:'STK-PHON-AAAA',factoryBarcode:'123',buyingPrice:10,sellingPrice:20,quantity:8,openingQuantity:10,minStockLevel:2,expiryDate:'2027-01-02',deleted:true,updatedAt:'2026-01-01T00:00:00Z'};
const transaction:StockTransaction={id:'t',productId:'p',productName:'Phone',type:'ADJUST',quantity:-2,unitBuyingPrice:10,unitSellingPrice:20,performedByRole:'OWNER',notes:'count correction',timestamp:'2026-01-02T03:04:05.000Z'};
describe('Supabase row mappers',()=>{
 test('product round trip retains fields',()=>expect(mapDbRowToProduct(mapProductToDbRow(product))).toMatchObject(product));
 test('product row uses snake case and opening quantity',()=>expect(mapProductToDbRow(product)).toMatchObject({qr_code:'STK-PHON-AAAA',opening_quantity:10,deleted:true}));
 test('null opening quantity maps to undefined',()=>expect(mapDbRowToProduct({...mapProductToDbRow(product),opening_quantity:null}).openingQuantity).toBeUndefined());
 test('missing opening quantity maps to undefined',()=>expect(mapDbRowToProduct({id:'x',name:'x',qr_code:'x',quantity:4}).openingQuantity).toBeUndefined());
 test('transaction round trip retains fields',()=>expect(mapDbRowToTransaction(mapTransactionToDbRow(transaction))).toMatchObject(transaction));
 test('ADJUST type survives mapping in both directions',()=>{expect(mapDbRowToTransaction(mapTransactionToDbRow(transaction)).type).toBe('ADJUST');expect(mapTransactionToDbRow(transaction).type).toBe('ADJUST')});
 test('unknown transaction type safely defaults to SALE',()=>expect(mapDbRowToTransaction({...mapTransactionToDbRow(transaction),type:'OTHER'}).type).toBe('SALE'));
 test('null optional product fields round trip',()=>expect(mapDbRowToProduct(mapProductToDbRow({...product,factoryBarcode:undefined,expiryDate:undefined}))).toMatchObject({factoryBarcode:undefined,expiryDate:undefined}));
});
describe('explainSupabaseError',()=>{
 test.each(['column opening_quantity does not exist','deleted column missing','violates check constraint'])('adds schema migration steps for %s',s=>expect(explainSupabaseError({message:s})).toContain('supabase/schema.sql'));
 test('returns ordinary error unchanged',()=>expect(explainSupabaseError({message:'network offline'})).toBe('network offline'));
 test('handles string and absent error values',()=>{expect(explainSupabaseError('oops')).toBe('oops');expect(explainSupabaseError(null)).toBe('Unknown error')});
});
