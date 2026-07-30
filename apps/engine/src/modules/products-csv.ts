import { one, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { getLimits } from './entitlements.js';

// Inventory bulk import/export as CSV. Columns are chosen so a non-technical
// owner can fill them in Excel/Google Sheets from the exported template. Import
// upserts by SKU: a row whose sku matches an existing product (within the same
// business) updates it; anything else is inserted. Kept dependency-free — the
// parser below handles quoted fields, escaped quotes, CRLF and a BOM, which is
// all a spreadsheet export produces.

export const PRODUCT_CSV_COLUMNS = [
  'sku', 'name', 'description', 'category', 'price', 'cost', 'currency', 'stock', 'track_stock', 'active',
] as const;

// A ready-to-fill template: the header plus one worked example row.
export function templateCsv(): string {
  const example = ['SKU-001', 'Camiseta azul', 'Talla M, algodón', 'Ropa', '39.90', '18.00', 'PEN', '25', '1', '1'];
  return [PRODUCT_CSV_COLUMNS.join(','), example.map(csvEscape).join(',')].join('\n');
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Minimal RFC-4180-ish parser → array of rows, each an array of cell strings.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ''); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  // flush the trailing field/row if the file didn't end with a newline
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // drop fully-empty rows (e.g. a trailing blank line)
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (v: string): number | null => {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const bool = (v: string, fallback: number): number => {
  const s = v.trim().toLowerCase();
  if (s === '') return fallback;
  return ['1', 'true', 'si', 'sí', 'yes', 'y', 'x'].includes(s) ? 1 : 0;
};

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export async function importProductsCsv(csv: string): Promise<ImportResult> {
  const rows = parseCsv(csv);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  if (rows.length === 0) return result;

  // Map the header so column order doesn't matter and unknown columns are ignored.
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const businessId = currentBusinessId();

  // Tier cap: updates to existing products are always allowed, but new inserts
  // can't push the catalog past the plan's product limit. We track a live count
  // so a single import can't sneak past the cap row-by-row.
  const productLimit = (await getLimits()).products;
  let productCount = (await one<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM products WHERE business_id = $1', [businessId]))?.n ?? 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const cell = (name: string) => { const i = idx(name); return i >= 0 && i < cells.length ? cells[i] : ''; };
    const lineNo = r + 1; // 1-based, matching what a spreadsheet shows
    try {
      const name = cell('name').trim();
      if (!name) { result.errors.push({ row: lineNo, message: 'Falta el nombre (name)' }); continue; }
      const price = num(cell('price'));
      if (price === null || Number.isNaN(price) || price < 0) {
        result.errors.push({ row: lineNo, message: 'Precio (price) inválido' }); continue;
      }
      const costRaw = num(cell('cost'));
      if (costRaw !== null && Number.isNaN(costRaw)) { result.errors.push({ row: lineNo, message: 'Costo (cost) inválido' }); continue; }
      const stockRaw = num(cell('stock'));
      if (stockRaw !== null && (Number.isNaN(stockRaw) || !Number.isInteger(stockRaw))) {
        result.errors.push({ row: lineNo, message: 'Stock inválido (debe ser entero)' }); continue;
      }
      const sku = cell('sku').trim() || null;
      const description = cell('description');
      const category = cell('category');
      const currency = cell('currency').trim() || 'PEN';
      const cost = costRaw;
      const stock = stockRaw;
      // track_stock defaults to on when a stock value is present, else off.
      const trackStock = bool(cell('track_stock'), stock !== null ? 1 : 0);
      const active = bool(cell('active'), 1);

      const existing = sku
        ? await one<{ id: number }>('SELECT id FROM products WHERE business_id = $1 AND sku = $2', [businessId, sku])
        : undefined;

      if (existing) {
        await none(
          `UPDATE products SET name = $1, description = $2, price = $3, currency = $4, cost = $5,
             category = $6, stock = $7, track_stock = $8, active = $9 WHERE id = $10 AND business_id = $11`,
          [name, description, price, currency, cost, category, stock, trackStock, active, existing.id, businessId]);
        result.updated++;
      } else {
        if (productCount >= productLimit) {
          result.errors.push({ row: lineNo, message: `Alcanzaste el límite de tu plan (${productLimit} productos). Actualiza para agregar más.` });
          continue;
        }
        await none(
          `INSERT INTO products (business_id, name, description, price, currency, cost, sku, category, stock, track_stock, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [businessId, name, description, price, currency, cost, sku, category, stock, trackStock, active]);
        result.created++;
        productCount++;
      }
    } catch (err: any) {
      result.errors.push({ row: lineNo, message: String(err?.message ?? err).slice(0, 200) });
    }
  }
  return result;
}
