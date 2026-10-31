import * as L from '../src/logic/inventoryLogic';
import { Product, StockTransaction, InventoryState } from '../src/types/inventory';

const p=(overrides:Partial<Product>={}):Product=>({id:'p1',name:'Phone',category:'Tech',qrCode:'STK-PHON-AAAA',buyingPrice:10,sellingPrice:20,quantity:10,openingQuantity:10,minStockLevel:2,updatedAt:'2026-01-01T00:00:00Z',...overrides});
const tx=(overrides:Partial<StockTransaction>={}):StockTransaction=>({id:'t1',productId:'p1',productName:'Phone',type:'SALE',quantity:2,unitBuyingPrice:10,unitSellingPrice:20,performedByRole:'OWNER',timestamp:'2026-02-10T12:00:00Z',...overrides});
const state=(products:Product[]= [p()],transactions:StockTransaction[]=[]):InventoryState=>({products,transactions});

describe('stock math and normalization',()=>{
 test.each([['SALE',2,-2],['RESTOCK',2,2],['ADJUST',-3,-3],['ADJUST',0,0]] as const)('txDelta %s %s', (type,quantity,want)=>expect(L.txDelta({type,quantity})).toBe(want));
 test('legacy opening quantity preserves displayed stock',()=>expect(L.ensureOpeningQuantities([p({openingQuantity:undefined,quantity:8})],[tx()])[0].openingQuantity).toBe(10));
 test('opening quantity already set is kept',()=>expect(L.ensureOpeningQuantities([p({openingQuantity:7})],[])[0].openingQuantity).toBe(7));
 test('recompute applies sale restock and signed adjustment',()=>expect(L.recomputeQuantities([p({openingQuantity:10})],[tx({quantity:3}),tx({id:'2',type:'RESTOCK',quantity:4}),tx({id:'3',type:'ADJUST',quantity:-2})])[0].quantity).toBe(9));
 test('normalize drops invalid product and transaction records',()=>{const n=L.normalizeState({products:[p(),{} as Product],transactions:[tx(),{} as StockTransaction]});expect(n.products).toHaveLength(1);expect(n.transactions).toHaveLength(1)});
 test('normalize dedupes transaction ids keeping first occurrence',()=>{const n=L.normalizeState(state([p({openingQuantity:10})],[tx(),tx({quantity:9})]));expect(n.transactions).toHaveLength(1);expect(n.products[0].quantity).toBe(8)});
 test('invalid transaction types are rejected',()=>expect(L.isValidTransaction({...tx(),type:'OTHER'})).toBe(false));
 test('valid product and transaction accepted',()=>{expect(L.isValidProduct(p())).toBe(true);expect(L.isValidTransaction(tx())).toBe(true)});
});

describe('state merging',()=>{
 const local=state([p({openingQuantity:10})],[tx({id:'a',quantity:1})]);
 const remote=state([p({name:'Remote',updatedAt:'2026-02-01T00:00:00Z',openingQuantity:10,synced:false})],[tx({id:'b',quantity:2,synced:false})]);
 test('transaction union by id',()=>expect(L.mergeStates(local,remote).transactions.map(t=>t.id).sort()).toEqual(['a','b']));
 test('newest product details win',()=>expect(L.mergeStates(local,remote).products[0].name).toBe('Remote'));
 test('timestamp ties keep local details',()=>expect(L.mergeStates(local,state([p({name:'Tie remote'})],[])).products[0].name).toBe('Phone'));
 test('two devices selling both reduce stock',()=>expect(L.mergeStates(local,remote).products[0].quantity).toBe(7));
 test('merge is order independent for concurrent transactions',()=>{const a=L.mergeStates(local,remote),b=L.mergeStates(remote,local);expect(a.transactions.map(x=>x.id).sort()).toEqual(b.transactions.map(x=>x.id).sort());expect(a.products[0].quantity).toBe(b.products[0].quantity)});
 test('merge is idempotent',()=>{const once=L.mergeStates(local,remote),twice=L.mergeStates(once,remote);expect(twice.products[0].quantity).toBe(once.products[0].quantity);expect(twice.transactions).toHaveLength(once.transactions.length)});
 test('soft deleted product remains deleted',()=>expect(L.mergeStates(local,state([p({deleted:true,updatedAt:'2027-01-01'})],[])).products[0].deleted).toBe(true));
 test('remote product and transaction are marked synced',()=>{const m=L.mergeStates(local,remote);expect(m.products[0].synced).toBe(true);expect(m.transactions.find(x=>x.id==='b')?.synced).toBe(true)});
 test('local-only flags stay local',()=>expect(L.mergeStates(local,remote).transactions.find(x=>x.id==='a')?.synced).toBeUndefined());
 test('activeProducts omits deleted',()=>expect(L.activeProducts([p(),p({id:'d',deleted:true})])).toHaveLength(1));
 test('sameContent ignores sync flags',()=>expect(L.sameContent(state([p({synced:false})]),state([p({synced:true})]))).toBe(true));
});

describe('barcode matching and generated codes',()=>{
 test.each([' stk-phon-aaaa ','StK-PhOn-AaAa'])('QR exact match %s',code=>expect(L.findProductByCode([p()],code)?.id).toBe('p1'));
 test.each([' 0123456789012 ','0123456789012'])('factory barcode exact match %s',code=>expect(L.findProductByCode([p({factoryBarcode:'0123456789012'})],code)?.id).toBe('p1'));
 test('QR embedded in URL payload matches',()=>expect(L.findProductByCode([p()],'https://example.test/STK-PHON-AAAA?x=1')?.id).toBe('p1'));
 test('factory barcode containing QR digits is not a match',()=>expect(L.findProductByCode([p({factoryBarcode:'991001887'})],'1001')).toBeUndefined());
 test('deleted product never matches QR or barcode',()=>expect(L.findProductByCode([p({deleted:true,factoryBarcode:'123'})],'STK-PHON-AAAA')).toBeUndefined());
 test('empty scan does not match',()=>expect(L.findProductByCode([p()],'  ')).toBeUndefined());
 test('QR wins before factory barcode collision',()=>expect(L.findProductByCode([p(),p({id:'p2',factoryBarcode:'STK-PHON-AAAA'})],'STK-PHON-AAAA')?.id).toBe('p1'));
 test('unique code retries deterministic collision',()=>{let i=0;const nums=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];const random=()=>nums[i++]===undefined?0.99:nums[i-1];const got=L.generateUniqueQrCode('Phone',['STK-PHON-AAAA'],random);expect(got).not.toBe('STK-PHON-AAAA');expect(got).toMatch(/^STK-PHON-/)});
 test('unique code uses normalized product prefix',()=>expect(L.generateUniqueQrCode('a b',[],()=>0)).toMatch(/^STK-ABXX-/));
});

describe('dates and parsers',()=>{
 test.each(['2026-02-30','2026-13-01','2026-1-1','nope'])('rejects invalid date %s',d=>expect(L.isValidIsoDate(d)).toBe(false));
 test.each(['2024-02-29','2026-01-01','2000-12-31'])('accepts valid date %s',d=>expect(L.isValidIsoDate(d)).toBe(true));
 test.each([['12.5',12.5],[' 0 ',0],['1,25',1.25],['.5',0.5]] as const)('parses nonnegative %s', (s,n)=>expect(L.parseNonNegativeNumber(s)).toBe(n));
 test.each([['1.2',1.2],['1,2',1.2],['0',0]] as const)('accepts decimal input %s',(s,n)=>expect(L.parseNonNegativeNumber(s)).toBe(n));
 test.each(['','-1','abc','1.2.3'])('rejects nonnegative input %s',s=>expect(L.parseNonNegativeNumber(s)).toBeNull());
 test.each([['0',0],['42',42],['9007199254740991',Number.MAX_SAFE_INTEGER]] as const)('parses whole number %s',(s,n)=>expect(L.parseWholeNumber(s)).toBe(n));
 test.each(['-1','1.2','1,2','9007199254740992',''])('rejects whole number %s',s=>expect(L.parseWholeNumber(s)).toBeNull());
 test('daysUntil handles today/future/past',()=>{const now=new Date(2026,4,10,13);expect(L.daysUntil('2026-05-10',now)).toBe(0);expect(L.daysUntil('2026-05-12',now)).toBe(2);expect(L.daysUntil('2026-05-08',now)).toBe(-2)});
 test('daysUntil rejects invalid date',()=>expect(L.daysUntil('2026-02-30')).toBeNull());
});

describe('monthly summaries and CSV',()=>{
 const ps=[p({id:'p1',name:'Live',sellingPrice:20}),p({id:'gone',name:'Gone',deleted:true})];
 const sales=[tx({id:'s1',productId:'p1',productName:'Live',quantity:2,unitSellingPrice:20,unitBuyingPrice:10}),tx({id:'s2',productId:'gone',productName:'Gone',quantity:1,unitSellingPrice:30,unitBuyingPrice:12}),tx({id:'a',type:'ADJUST',quantity:99,unitSellingPrice:900}),tx({id:'r',type:'RESTOCK',quantity:4,unitBuyingPrice:5})];
 test('local month key formats local date',()=>expect(L.localMonthKey(new Date(2026,0,1))).toBe('2026-01'));
 test('invalid month input yields empty key',()=>expect(L.localMonthKey('invalid')).toBe(''));
 test('available months includes current month and transaction months descending',()=>expect(L.availableMonths([tx({timestamp:'2025-01-01'})],new Date(2026,1,1)).map(x=>x.key)).toEqual(['2026-02','2025-01']));
 test('monthly revenue cost profit and margin',()=>{const m=L.buildMonthlySummary(ps,sales,'2026-02');expect(m.totalRevenue).toBe(70);expect(m.totalCostOfGoods).toBe(32);expect(m.grossProfit).toBe(38);expect(m.profitMarginPercent).toBeCloseTo(38/70*100)});
 test('adjustments and restocks do not count as revenue',()=>expect(L.buildMonthlySummary(ps,sales,'2026-02').totalRevenue).toBe(70));
 test('deleted product past sale contributes to totals but is omitted from worst sellers',()=>{const m=L.buildMonthlySummary(ps,sales,'2026-02');expect(m.totalUnitsSold).toBe(3);expect(m.worstSellers.some(x=>x.productId==='gone')).toBe(false)});
 test('restock totals remain separate',()=>{const m=L.buildMonthlySummary(ps,sales,'2026-02');expect(m.totalUnitsRestocked).toBe(4);expect(m.restockSpend).toBe(20)});
 test('zero revenue margin is zero',()=>expect(L.buildMonthlySummary(ps,[],'2026-02').profitMarginPercent).toBe(0));
 test.each(['=1+1','+cmd','-1+2','@SUM(A1)'])('CSV neutralizes formula prefix %s',s=>expect(L.csvCell(s)).toBe(`"'${s}"`));
 test('CSV quotes and doubles embedded quotes',()=>expect(L.csvCell('a,"b"')).toBe('"a,""b"""'));
 test('CSV numeric cell is not quoted',()=>expect(L.csvCell(12.5)).toBe('12.5'));
});

describe('versions, pairing and sync codes',()=>{
 test.each([['v2.4.0','2.3.9',1],['1.0','1.0.0',0],['1.0','2',-1]] as const)('compareVersions %s %s',(a,b,n)=>expect(Math.sign(L.compareVersions(a,b))).toBe(n));
 test('builds pairing prefix',()=>expect(L.buildPairingPayload('abcdefghijklmnopqrst')).toBe('STOCKQR-SYNC:abcdefghijklmnopqrst'));
 test('parses pairing prefix case insensitively',()=>expect(L.parsePairingPayload('stockqr-sync:ABCDEFGHIJKLMNOPQRST')).toBe('abcdefghijklmnopqrst'));
 test('parses raw pairing code',()=>expect(L.parsePairingPayload('abcdefghijklmnopqrst')).toBe('abcdefghijklmnopqrst'));
 test.each(['short','!'.repeat(24),'STOCKQR-SYNC:no'])('rejects short or garbage pairing code',s=>expect(L.parsePairingPayload(s)).toBeNull());
 test('syncCodeFromBytes maps base36 digits',()=>expect(L.syncCodeFromBytes(new Uint8Array([0,1,9,10,35]))).toBe('019az'));
});
