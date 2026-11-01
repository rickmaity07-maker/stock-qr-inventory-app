/** Request shapes. Anything that doesn't match is rejected before it reaches the database. */
import { z } from 'zod';

const isoDateTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be a date-time');

const money = z.number().finite().min(0).max(10_000_000);
const int = z.number().int().min(-1_000_000).max(1_000_000);

export const productIn = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).default('General'),
  qrCode: z.string().trim().min(1).max(120),
  factoryBarcode: z.string().trim().max(120).optional().nullable(),
  buyingPrice: money,
  sellingPrice: money,
  quantity: int,
  openingQuantity: int.optional().nullable(),
  minStockLevel: z.number().int().min(0).max(1_000_000),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
    .catch(null),
  deleted: z.boolean().optional(),
  updatedAt: isoDateTime,
});

export const transactionIn = z
  .object({
    id: z.string().min(1).max(80),
    productId: z.string().min(1).max(80),
    productName: z.string().trim().min(1).max(200),
    type: z.enum(['SALE', 'RESTOCK', 'ADJUST']),
    quantity: int,
    unitBuyingPrice: money,
    unitSellingPrice: money,
    performedByRole: z.enum(['OWNER', 'STAFF']).catch('OWNER'),
    notes: z.string().max(500).optional().nullable(),
    timestamp: isoDateTime,
  })
  .refine((t) => (t.type === 'ADJUST' ? t.quantity !== 0 : t.quantity > 0), 'invalid quantity for type');

export const syncIn = z.object({
  cursor: z.number().int().min(0).default(0),
  products: z.array(z.unknown()).max(5000).default([]),
  transactions: z.array(z.unknown()).max(20000).default([]),
});

export const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const setupIn = credentials.extend({ setupKey: z.string().min(1).max(200) });

export const passwordChangeIn = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export type ProductIn = z.infer<typeof productIn>;
export type TransactionIn = z.infer<typeof transactionIn>;

export const errorReportsIn = z.object({
  reports: z
    .array(
      z.object({
        message: z.string().min(1).max(4000),
        stack: z.string().max(20000).optional().nullable(),
        appVersion: z.string().max(40).optional().nullable(),
        platform: z.string().max(40).optional().nullable(),
        context: z.string().max(4000).optional().nullable(),
        at: isoDateTime.optional().nullable(),
      })
    )
    .min(1)
    .max(20),
});
