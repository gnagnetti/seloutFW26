import * as XLSX from 'xlsx';
import type {
  AggregatedProductItem,
  PerformanceTier,
  ProductItem,
  StoreRecord,
  UnifiedDatabase,
} from '../types/retail';

export const SIZE_ORDER = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  'U',
  '36',
  '37',
  '38',
  '39',
  '40',
  '42',
  '44',
  '46',
  '48',
  '50',
  '52',
];

const VALID_SIZES_SET = new Set(SIZE_ORDER);

export function getOrdered(item: ProductItem): number {
  let total = 0;
  for (const [ord] of Object.values(item.sizes)) {
    total += ord;
  }
  return total;
}

export function getSold(item: ProductItem): number {
  let total = 0;
  for (const [, sld] of Object.values(item.sizes)) {
    total += sld;
  }
  return total;
}

export function getSellOutPct(sold: number, ordered: number): number {
  return ordered > 0 ? (sold / ordered) * 100 : 0;
}

export function getTier(item: ProductItem): Exclude<PerformanceTier, 'all'> {
  const ordered = getOrdered(item);
  const sold = getSold(item);
  if (ordered > 0 && sold >= ordered) return 'out';
  const pct = getSellOutPct(sold, ordered);
  if (pct >= 70) return 'lead';
  if (pct >= 40) return 'mid';
  return 'slow';
}

export function formatEur(value: number): string {
  return `€${Math.round(value).toLocaleString('it-IT')}`;
}

export function sortSizeEntries(sizes: Record<string, [number, number]>) {
  return Object.entries(sizes).sort(([a], [b]) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function normalizeStyleKey(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function compactStyleKey(s: string): string {
  return normalizeStyleKey(s).replace(/[\.\-_/\s]+/g, '');
}

export function baseStyleKey(s: string): string {
  const clean = normalizeStyleKey(s)
    .replace(/[\.\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.split(' ')[0] || '';
}

export function extractColorCode(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const paren = s.match(/\((\d{3,4})\b/);
  if (paren) return paren[1].padStart(4, '0');
  if (/^\d{3,4}$/.test(s)) return s.padStart(4, '0');
  const slash = s.match(/^(\d{3,4})\s*[/_\-]/);
  if (slash) return slash[1].padStart(4, '0');
  const four = s.match(/\b(\d{4})\b/);
  if (four) return four[1];
  const three = s.match(/\b(\d{3})\b/);
  if (three) return three[1].padStart(4, '0');
  const startFour = s.match(/^(\d{4})/);
  if (startFour) return startFour[1];
  return '';
}

function normalizeSizeToken(raw: string): string {
  const s = String(raw || '')
    .replace(/\.0$/, '')
    .trim()
    .toUpperCase();
  if (s === 'UNI' || s === 'UNICA' || s === 'ONE SIZE' || s === 'OS') return 'U';
  return s || 'U';
}

function isLikelySize(raw: string): boolean {
  const s = normalizeSizeToken(raw);
  return VALID_SIZES_SET.has(s) || /^(3[5-9]|4[0-9]|5[0-4])$/.test(s);
}

function parseNum(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback;
  const s = String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/,(?=\d{1,2}$)/, '.')
    .replace(/,/g, '');
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function aggregateModels(
  items: ProductItem[],
  storesById: Map<string, StoreRecord>,
  allStoresLabel: string,
  colorsLabel = 'colori',
  storesLabel = 'negozi',
  allStoresSelected = false
): AggregatedProductItem[] {
  const grouped = new Map<
    string,
    {
      base: ProductItem;
      baseScore: number;
      poSet: Set<string>;
      sizes: Record<string, [number, number]>;
      byStore: Map<string, { ordered: number; sold: number; revenue: number }>;
      byColor: Map<
        string,
        {
          color: string;
          cc: string;
          img: string | null;
          ordered: number;
          sold: number;
          revenue: number;
        }
      >;
      searchTokens: Set<string>;
      realizedRevenue: number;
      potentialRevenue: number;
      wholesaleValue: number;
      totalOrderedUnits: number;
    }
  >();

  for (const item of items) {
    const key = normalizeStyleKey(item.name) || item.num || `${item.name}|${item.cc}`;
    let itemOrd = 0;
    let itemSld = 0;
    for (const [o, s] of Object.values(item.sizes)) {
      itemOrd += o;
      itemSld += s;
    }

    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        base: { ...item },
        baseScore: item.img ? itemOrd + 1000 : itemOrd,
        poSet: new Set<string>(),
        sizes: {},
        byStore: new Map(),
        byColor: new Map(),
        searchTokens: new Set<string>(),
        realizedRevenue: 0,
        potentialRevenue: 0,
        wholesaleValue: 0,
        totalOrderedUnits: 0,
      };
      grouped.set(key, entry);
    } else {
      const score = item.img ? itemOrd + 1000 : itemOrd;
      if (score > entry.baseScore && item.img) {
        entry.base.img = item.img;
        entry.baseScore = score;
      }
      if (!entry.base.img && item.img) entry.base.img = item.img;
      if (!entry.base.fab && item.fab) entry.base.fab = item.fab;
      if (!entry.base.num && item.num) entry.base.num = item.num;
    }

    entry.searchTokens.add(item.name);
    if (item.num) entry.searchTokens.add(item.num);
    if (item.color) entry.searchTokens.add(item.color);
    if (item.cc) entry.searchTokens.add(item.cc);
    if (item.fab) entry.searchTokens.add(item.fab);
    if (item.storeName) entry.searchTokens.add(item.storeName);
    if (item.groupName) entry.searchTokens.add(item.groupName);

    for (const po of item.po.split(',').map((p) => p.trim()).filter(Boolean)) {
      entry.poSet.add(po);
    }

    for (const [sz, [o, s]] of Object.entries(item.sizes)) {
      const prev = entry.sizes[sz] ?? [0, 0];
      entry.sizes[sz] = [prev[0] + o, prev[1] + s];
    }

    const rev = itemSld * item.rtl;
    entry.realizedRevenue += rev;
    entry.potentialRevenue += itemOrd * item.rtl;
    entry.wholesaleValue += itemOrd * item.whs;
    entry.totalOrderedUnits += itemOrd;

    const prevStore = entry.byStore.get(item.storeId) ?? {
      ordered: 0,
      sold: 0,
      revenue: 0,
    };
    entry.byStore.set(item.storeId, {
      ordered: prevStore.ordered + itemOrd,
      sold: prevStore.sold + itemSld,
      revenue: prevStore.revenue + rev,
    });

    const colorKey = item.cc || item.color.toUpperCase() || 'DEFAULT';
    const prevColor = entry.byColor.get(colorKey) ?? {
      color: item.color,
      cc: item.cc,
      img: item.img,
      ordered: 0,
      sold: 0,
      revenue: 0,
    };
    if (!prevColor.img && item.img) prevColor.img = item.img;
    entry.byColor.set(colorKey, {
      color: prevColor.color || item.color,
      cc: prevColor.cc || item.cc,
      img: prevColor.img,
      ordered: prevColor.ordered + itemOrd,
      sold: prevColor.sold + itemSld,
      revenue: prevColor.revenue + rev,
    });
  }

  const totalStoresCount = storesById.size;
  const result: AggregatedProductItem[] = [];
  for (const entry of grouped.values()) {
    const storeBreakdown = Array.from(entry.byStore.entries())
      .map(([storeId, stats]) => {
        const st = storesById.get(storeId);
        return {
          storeId,
          storeName: st?.name ?? storeId,
          shortName: st?.shortName ?? storeId,
          groupName: st?.groupName ?? '',
          ordered: stats.ordered,
          sold: stats.sold,
          revenue: stats.revenue,
          pct: getSellOutPct(stats.sold, stats.ordered),
        };
      })
      .sort((a, b) => b.sold - a.sold || b.ordered - a.ordered);

    const colorBreakdown = Array.from(entry.byColor.values())
      .map((c) => ({
        ...c,
        pct: getSellOutPct(c.sold, c.ordered),
      }))
      .sort((a, b) => b.sold - a.sold || b.ordered - a.ordered);

    const storeCount = storeBreakdown.length;
    const colorCodes = colorBreakdown.map((c) => c.cc || c.color).filter(Boolean);
    const colorSummary =
      colorBreakdown.length <= 1
        ? colorBreakdown[0]?.color ?? entry.base.color
        : `${colorBreakdown.length} ${colorsLabel} (${colorCodes.join(', ')})`;

    const avgRtl =
      entry.totalOrderedUnits > 0
        ? entry.potentialRevenue / entry.totalOrderedUnits
        : entry.base.rtl;
    const avgWhs =
      entry.totalOrderedUnits > 0
        ? entry.wholesaleValue / entry.totalOrderedUnits
        : entry.base.whs;

    const storeLabel =
      storeCount === 1
        ? storeBreakdown[0].storeName
        : allStoresSelected
          ? storeCount === totalStoresCount
            ? `${allStoresLabel} (${storeCount})`
            : `${allStoresLabel} (${storeCount}/${totalStoresCount})`
          : `${storeCount} ${storesLabel}`;

    result.push({
      ...entry.base,
      color: colorSummary,
      cc: colorBreakdown.length === 1 ? colorBreakdown[0].cc : '',
      rtl: avgRtl,
      whs: avgWhs,
      storeId: storeCount === 1 ? storeBreakdown[0].storeId : 'multi',
      storeName: storeLabel,
      groupName:
        new Set(storeBreakdown.map((s) => s.groupName)).size === 1
          ? storeBreakdown[0].groupName
          : 'Multi-Gruppo',
      po: Array.from(entry.poSet).join(', '),
      sizes: entry.sizes,
      storeCount,
      storeBreakdown,
      colorBreakdown,
      searchMeta: Array.from(entry.searchTokens).join(' '),
      realizedRevenue: entry.realizedRevenue,
      potentialRevenue: entry.potentialRevenue,
      wholesaleValue: entry.wholesaleValue,
    });
  }

  return result;
}

export function exportUnifiedCsv(items: ProductItem[], filename: string) {
  const headers = [
    'Gruppo',
    'Negozio',
    'Modello',
    'Codice Stile',
    'Colore',
    'Codice Colore',
    'Categoria',
    'Collezione',
    'PO#',
    'Composizione',
    'Sell_In',
    'Sell_Out',
    'Sell_Out_%',
    'Wholesale_EUR',
    'Retail_EUR',
    'Fatturato_EUR',
    'Taglie_Dettaglio',
  ];

  const esc = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = items.map((item) => {
    const ord = getOrdered(item);
    const sld = getSold(item);
    const pct = getSellOutPct(sld, ord).toFixed(1);
    const sizeStr = sortSizeEntries(item.sizes)
      .map(([sz, [o, s]]) => `${sz}:${s}/${o}`)
      .join(' | ');
    return [
      item.groupName,
      item.storeName,
      item.name,
      item.num,
      item.color,
      item.cc,
      item.cat,
      item.line,
      item.po,
      item.fab,
      ord,
      sld,
      pct,
      item.whs,
      item.rtl,
      Math.round(sld * item.rtl),
      sizeStr,
    ]
      .map(esc)
      .join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ParsedSellOutLine {
  style: string;
  colorCode: string;
  size: string;
  qty: number;
  silhouette?: string;
}

function splitCsvLinesToRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rawLines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  const splitSingle = (line: string, delim: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const firstUnwrapped =
    rawLines[0].startsWith('"') && rawLines[0].endsWith('"') && rawLines[0].length > 2
      ? rawLines[0].slice(1, -1).replace(/""/g, '"')
      : rawLines[0];

  const delim = firstUnwrapped.includes('\t')
    ? '\t'
    : firstUnwrapped.includes(';')
      ? ';'
      : ',';

  return rawLines.map((line) => {
    let cells = splitSingle(line, delim);
    if (
      cells.length === 1 &&
      (cells[0].includes(delim) || cells[0].includes(';') || cells[0].includes('\t'))
    ) {
      const innerDelim = cells[0].includes('\t')
        ? '\t'
        : cells[0].includes(';')
          ? ';'
          : delim;
      cells = splitSingle(cells[0], innerDelim);
    }
    return cells;
  });
}

const GARMENT_WORDS_RE =
  /(?:^|[\s,./\-_()]+)(?:платье|жакет|пальто|юбка|блузка|блуза|джемпер|брюки|костюм|кардиган|топ|рубашка|полупальто|пуховик|жилет|шарф|ремень|сумка|пуловер|водолазка|abito|dress|giacca|jacket|gonna|skirt|cappotto|coat|pantaloni|trousers|pants|maglia|knitwear|camicia|blouse|polo|shirt|var|colore|col|цвет|кол|арт|модель)(?=$|[\s,./\-_()]+)/gi;

const isQtyHeader = (c: string) =>
  c.includes('sell out') ||
  c.includes('sell_out') ||
  c.includes('sellout') ||
  c.includes('quant') ||
  c.includes('qty') ||
  c.includes('sold') ||
  c.includes('vendut') ||
  c.includes('pezzi') ||
  c.includes('unit') ||
  c.includes('unita') ||
  c.includes('unità') ||
  c.includes('pcs') ||
  c.includes('piece') ||
  c.includes('кол') ||
  c.includes('продан') ||
  c.includes('расход') ||
  c.includes('факт') ||
  c === 'pz' ||
  c === 'qta' ||
  c === 'q.ta' ||
  c === 'шт';

export function parseSellOutRows(rawRows: unknown[][]): ParsedSellOutLine[] {
  const rows = rawRows
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
    .filter((r) => r.some((c) => c.length > 0));

  if (rows.length === 0) return [];

  // Strategy 1: Standard tabular header (IT / EN / RU)
  let headerIdx = -1;
  let styleIdx = -1;
  let colorIdx = -1;
  let sizeIdx = -1;
  let qtyIdx = -1;
  let silIdx = -1;
  let descIdx = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cols = rows[i].map((c) => c.toLowerCase());
    const hasStyle = cols.some(
      (c) =>
        c.includes('style') ||
        c.includes('modell') ||
        c.includes('модель') ||
        c.includes('артикул') ||
        c.includes('номенклатура') ||
        c === 'art' ||
        c === 'articolo'
    );
    const hasQty = cols.some(isQtyHeader);
    const hasSize = cols.some(
      (c) =>
        c.includes('size') ||
        c.includes('tagli') ||
        c.includes('размер') ||
        c === 'tg' ||
        c === 'misura'
    );

    if ((hasStyle && (hasQty || hasSize)) || (hasQty && hasSize)) {
      headerIdx = i;
      // Prefer explicit style/article code before full nomenclature description
      styleIdx = cols.findIndex(
        (c) =>
          c.includes('style name') ||
          c === 'style' ||
          c.includes('modell') ||
          c.includes('модель') ||
          c.includes('артикул') ||
          c === 'art' ||
          c === 'articolo'
      );
      if (styleIdx === -1) {
        styleIdx = cols.findIndex(
          (c) => c.includes('style') || c.includes('номенклатура')
        );
      }
      colorIdx = cols.findIndex(
        (c) =>
          c.includes('color') ||
          c.includes('colour') ||
          c.includes('colore') ||
          c.includes('цвет') ||
          c.includes('код цвета')
      );
      sizeIdx = cols.findIndex(
        (c) =>
          c.includes('size') ||
          c.includes('tagli') ||
          c.includes('размер') ||
          c === 'tg' ||
          c === 'misura'
      );
      qtyIdx = cols.findIndex(isQtyHeader);
      silIdx = cols.findIndex(
        (c) =>
          c.includes('silhouette') ||
          c.includes('categor') ||
          c.includes('name') ||
          c.includes('nome') ||
          c.includes('descriz')
      );
      descIdx = cols.findIndex(
        (c) =>
          c.includes('характер') ||
          c.includes('описан') ||
          c.includes('characteristic') ||
          c.includes('variant') ||
          c.includes('специфик')
      );
      break;
    }
  }

  if (headerIdx !== -1 && (styleIdx !== -1 || qtyIdx !== -1)) {
    const out: ParsedSellOutLine[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const style = (styleIdx !== -1 ? r[styleIdx] : r[0])?.trim() || '';
      const low = style.toLowerCase();
      if (
        !style ||
        low === 'total' ||
        low === 'grand total' ||
        low === 'итого' ||
        low === 'итог' ||
        low === 'всего'
      ) {
        continue;
      }
      const rawColor = colorIdx !== -1 ? r[colorIdx] || '' : '';
      const rawSize = sizeIdx !== -1 ? r[sizeIdx] || '' : '';
      let colorCode = extractColorCode(rawColor);
      let size = rawSize ? normalizeSizeToken(rawSize) : '';
      let silhouette = silIdx !== -1 ? r[silIdx] : undefined;

      // Fallback to Характеристика/variant column or remaining descriptive cells when size/color columns are packed
      if ((!size || !colorCode) && (descIdx !== -1 || (colorIdx === -1 && sizeIdx === -1))) {
        const probeText =
          descIdx !== -1
            ? r[descIdx] || ''
            : r
                .filter((_, idx) => idx !== styleIdx && idx !== qtyIdx && idx !== colorIdx && idx !== sizeIdx)
                .join(', ');
        if (probeText) {
          const parts = probeText.split(',').map((p) => p.trim()).filter(Boolean);
          for (const p of parts) {
            if (!size && isLikelySize(p)) {
              size = normalizeSizeToken(p);
            } else if (!colorCode) {
              const cc = extractColorCode(p);
              if (cc) colorCode = cc;
            }
          }
          if (!silhouette && parts.length > 0 && !isLikelySize(parts[0]) && !extractColorCode(parts[0])) {
            silhouette = parts[0];
          }
        }
      }

      const qty =
        qtyIdx !== -1
          ? Math.round(parseNum(r[qtyIdx], r[qtyIdx] === '' ? 0 : 0))
          : 1;
      if (qty <= 0) continue;
      out.push({
        style,
        colorCode,
        size: size || 'U',
        qty,
        silhouette,
      });
    }
    if (out.length > 0) return out;
  }

  // Strategy 2: Smykov 1C Excel format (col[0] = Style, col[1] = "Name, Size, Color", col[3] = Units)
  const smykov1CRows: ParsedSellOutLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    const style = (r[0] || '').trim();
    const desc = (r[1] || '').trim();
    const low = style.toLowerCase();
    if (
      !style ||
      low === 'итого' ||
      low === 'всего' ||
      low === 'nan' ||
      low.includes('номенклатура') ||
      low.includes('артикул') ||
      !desc.includes(',')
    ) {
      continue;
    }
    const parts = desc.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    let size = 'U';
    let colorCode = '';
    for (const p of parts) {
      if (isLikelySize(p)) {
        size = normalizeSizeToken(p);
      } else {
        const cc = extractColorCode(p);
        if (cc) colorCode = cc;
      }
    }

    let qty = 0;
    for (const idx of [3, 4, 2, 5]) {
      if (r[idx] !== undefined && r[idx] !== '') {
        const n = parseNum(r[idx], -1);
        if (n > 0 && n <= 500) {
          qty = Math.round(n);
          break;
        }
      }
    }
    if (qty > 0) {
      smykov1CRows.push({
        style,
        colorCode,
        size,
        qty,
        silhouette: parts[0],
      });
    }
  }
  if (smykov1CRows.length >= 3) return smykov1CRows;

  // Strategy 3: 1C POS grouped format ("Luisa Spagnoli ..." or "Изделие ..." header + child "Size, Color" rows)
  const grouped1CRows: ParsedSellOutLine[] = [];
  let currentStyle: string | null = null;
  let currentColor = '';
  for (const r of rows) {
    const headerCell = r
      .slice(0, 6)
      .find((c) => /luisa\s*spagnoli/i.test(c) || /^изделие\s+/i.test(c));
    if (headerCell) {
      const cleaned = headerCell
        .replace(/luisa\s*spagnoli/i, ' ')
        .replace(/^изделие\s+/i, ' ')
        .trim();
      const cc = extractColorCode(cleaned);
      currentColor = cc;
      const stripped = cleaned
        .replace(/\(\d{3,4}[^)]*\)/g, ' ')
        .replace(/\b\d{3,4}\b/g, ' ')
        .replace(GARMENT_WORDS_RE, ' ')
        .trim();
      const tokens = stripped
        .split(/[\s,./\-_]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
      currentStyle = (tokens[0] || stripped.split(/\s+/)[0] || cleaned).toUpperCase();
      continue;
    }
    if (currentStyle) {
      const first = (r[0] || '').trim();
      const low = first.toLowerCase();
      if (!first || low === 'nan' || low === 'итого' || low === 'всего') continue;
      let size = 'U';
      let color = '';
      if (first.includes(',')) {
        const [szPart, colPart] = first.split(',').map((s) => s.trim());
        size = normalizeSizeToken(szPart);
        color = extractColorCode(colPart || '') || currentColor;
      } else if (isLikelySize(first)) {
        size = normalizeSizeToken(first);
        color = currentColor;
      } else {
        continue;
      }
      let qty = 0;
      for (const idx of [4, 7, 3, 5, 2, 1]) {
        if (r[idx] !== undefined && r[idx] !== '') {
          const n = parseNum(r[idx], -1);
          if (n > 0 && n <= 200) {
            qty = Math.round(n);
            break;
          }
        }
      }
      if (qty > 0) {
        grouped1CRows.push({
          style: currentStyle,
          colorCode: color,
          size,
          qty,
        });
      }
    }
  }
  if (grouped1CRows.length > 0) return grouped1CRows;

  // Strategy 4: Headerless flat table column inference
  const sample = rows.slice(0, 30);
  const maxCols = Math.max(...sample.map((r) => r.length));
  if (maxCols >= 2) {
    const scores = Array.from({ length: maxCols }, () => ({
      size: 0,
      qty: 0,
      color: 0,
    }));
    for (const r of sample) {
      r.forEach((cell, cIdx) => {
        if (isLikelySize(cell)) scores[cIdx].size++;
        const n = parseNum(cell, -1);
        if (n > 0 && n <= 200 && Number.isInteger(n)) scores[cIdx].qty++;
        if (/^\d{3,4}$/.test(cell) || /^\d{3,4}\/\d{3,4}$/.test(cell)) {
          scores[cIdx].color += 2;
        }
      });
    }
    let infSize = -1;
    let infQty = -1;
    let infColor = -1;
    let bestS = 1;
    let bestQ = 1;
    let bestC = 1;
    scores.forEach((sc, idx) => {
      if (sc.size > bestS) {
        bestS = sc.size;
        infSize = idx;
      }
    });
    scores.forEach((sc, idx) => {
      if (idx !== infSize && sc.qty > bestQ) {
        bestQ = sc.qty;
        infQty = idx;
      }
    });
    scores.forEach((sc, idx) => {
      if (idx !== infSize && idx !== infQty && sc.color > bestC) {
        bestC = sc.color;
        infColor = idx;
      }
    });
    let infStyle = 0;
    for (let i = 0; i < maxCols; i++) {
      if (i !== infSize && i !== infQty && i !== infColor) {
        infStyle = i;
        break;
      }
    }
    if (infSize !== -1 || infQty !== -1) {
      const infOut: ParsedSellOutLine[] = [];
      for (const r of rows) {
        const style = (r[infStyle] || '').trim();
        const low = style.toLowerCase();
        if (!style || style.length < 2 || low === 'итого' || low === 'total') continue;
        const size = infSize !== -1 ? normalizeSizeToken(r[infSize] || 'U') : 'U';
        const colorCode = infColor !== -1 ? extractColorCode(r[infColor] || '') : '';
        const qty = infQty !== -1 ? Math.round(parseNum(r[infQty], 0)) : 1;
        if (qty > 0) {
          infOut.push({ style, colorCode, size, qty });
        }
      }
      if (infOut.length > 0) return infOut;
    }
  }

  return [];
}

export async function parseSellOutFile(file: File): Promise<ParsedSellOutLine[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const allLines: ParsedSellOutLine[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: '',
      });
      allLines.push(...parseSellOutRows(raw));
    }
    return allLines;
  }

  const buf = await file.arrayBuffer();
  let text = '';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1251').decode(buf);
  }
  return parseSellOutRows(splitCsvLinesToRows(text));
}

export interface ParsedJoorOrderRow {
  poNumber: string;
  styleName: string;
  styleNumber: string;
  colorCodeStr: string;
  colorCode: string;
  category: string;
  fabrication: string;
  wholesaleEur: number;
  retailEur: number;
  sizes: Record<string, number>;
}

export async function parseJoorOrdersXlsx(file: File): Promise<ParsedJoorOrderRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const results: ParsedJoorOrderRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const lowSheet = sheetName.toLowerCase();
    if (
      lowSheet.includes('cancel') ||
      lowSheet.includes('annull') ||
      lowSheet.includes('void') ||
      lowSheet.includes('delete')
    ) {
      continue;
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    if (rows.length < 5) continue;

    let hdrIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const cells = rows[i].map((c) => String(c ?? '').trim());
      if (cells.includes('Style Name') || cells.includes('Style Number')) {
        hdrIdx = i;
        break;
      }
    }
    if (hdrIdx === -1) continue;

    const hdr = rows[hdrIdx].map((c) => String(c ?? '').trim());
    const colMap: Record<string, number> = {};
    const sizeCols: Array<{ size: string; idx: number }> = [];

    hdr.forEach((h, idx) => {
      if (!h) return;
      colMap[h] = idx;
      if (isLikelySize(h)) {
        sizeCols.push({ size: normalizeSizeToken(h), idx });
      }
    });

    const styleIdx = colMap['Style Name'] ?? 0;
    const numIdx = colMap['Style Number'] ?? 1;
    const rawColorIdx = colMap['Color'] ?? 2;
    const colorCodeIdx = colMap['Color Code'] ?? 3;
    const silIdx = colMap['Silhouette'] ?? 6;
    const fabIdx = colMap['Fabrication'] ?? colMap['Materials'] ?? 8;
    const rtlIdx = colMap['Sugg. Retail (EUR)'] ?? colMap['Retail (EUR)'] ?? -1;
    const whsIdx = colMap['WholeSale (EUR)'] ?? colMap['Wholesale (EUR)'] ?? -1;
    const unitsIdx = colMap['Units'] ?? -1;
    const poNumber = sheetName.replace(/^PO#\s*/i, '').trim();

    for (let r = hdrIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const styleName = String(row[styleIdx] ?? '').replace(/\s+/g, ' ').trim();
      const styleNumber = String(row[numIdx] ?? '').trim();
      const low = styleName.toLowerCase();

      // Exclude door-header rows ("Ip Smykov Igor Viktorovich - 1") & summary rows
      if (
        !styleName ||
        !styleNumber ||
        low === 'total' ||
        low === 'grand total' ||
        low.startsWith('ip smykov')
      ) {
        continue;
      }

      const colorCodeStr = String(row[colorCodeIdx] ?? '').trim();
      const rawColor = String(row[rawColorIdx] ?? '').trim();
      const cc =
        extractColorCode(colorCodeStr) ||
        (rawColor ? rawColor.padStart(12, '0').slice(0, 4) : '');

      const sizes: Record<string, number> = {};
      for (const { size, idx } of sizeCols) {
        const q = Math.round(parseNum(row[idx], 0));
        if (q > 0) {
          sizes[size] = (sizes[size] || 0) + q;
        }
      }
      if (Object.keys(sizes).length === 0 && unitsIdx !== -1) {
        const u = Math.round(parseNum(row[unitsIdx], 0));
        if (u > 0) sizes['U'] = u;
      }

      const whs = whsIdx !== -1 ? parseNum(row[whsIdx], 0) : 0;
      const rtl = rtlIdx !== -1 ? parseNum(row[rtlIdx], whs * 2.6) : whs * 2.6;

      results.push({
        poNumber,
        styleName,
        styleNumber,
        colorCodeStr: colorCodeStr || rawColor,
        colorCode: cc,
        category: String(row[silIdx] ?? 'Apparel').split(' - ')[0].trim() || 'Apparel',
        fabrication: String(row[fabIdx] ?? '').trim(),
        wholesaleEur: whs,
        retailEur: rtl,
        sizes,
      });
    }
  }

  return results;
}

function normCc(cc: string): string {
  const s = String(cc || '').trim();
  if (!s) return '';
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s.toUpperCase();
}

export function reconcileStoreSellOut(
  db: UnifiedDatabase,
  storeId: string,
  lines: ParsedSellOutLine[]
): {
  db: UnifiedDatabase;
  matchedUnits: number;
  unmatchedUnits: number;
  totalUnits: number;
  matchedSkus: number;
} {
  // Clone store items and reset sold counts cleanly without mutating Sell-In
  const storeItems: ProductItem[] = [];
  const otherItems: ProductItem[] = [];

  for (const item of db.items) {
    if (item.storeId === storeId) {
      const cleanSizes: Record<string, [number, number]> = {};
      for (const [sz, [ord]] of Object.entries(item.sizes)) {
        if (ord > 0) cleanSizes[sz] = [ord, 0];
      }
      storeItems.push({ ...item, sizes: cleanSizes });
    } else {
      otherItems.push(item);
    }
  }

  // Build 4-level lookup maps
  const exactMap = new Map<string, ProductItem[]>();
  const compactMap = new Map<string, ProductItem[]>();
  const baseMap = new Map<string, ProductItem[]>();
  const styleOnlyExact = new Map<string, ProductItem[]>();
  const styleOnlyCompact = new Map<string, ProductItem[]>();
  const styleOnlyBase = new Map<string, ProductItem[]>();

  const pushMap = (map: Map<string, ProductItem[]>, key: string, it: ProductItem) => {
    if (!key) return;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  };

  for (const it of storeItems) {
    const ns = normalizeStyleKey(it.name);
    const cs = compactStyleKey(it.name);
    const bs = baseStyleKey(it.name);
    const cc = normCc(it.cc);
    if (cc) {
      pushMap(exactMap, `${ns}|${cc}`, it);
      pushMap(compactMap, `${cs}|${cc}`, it);
      pushMap(baseMap, `${bs}|${cc}`, it);
    }
    pushMap(styleOnlyExact, ns, it);
    pushMap(styleOnlyCompact, cs, it);
    pushMap(styleOnlyBase, bs, it);
  }

  const pickBestCandidate = (candidates: ProductItem[] | undefined, sz: string): ProductItem | null => {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    // Prefer candidate that has remaining ordered stock in this size
    const withRemainingSize = candidates.find((c) => {
      const pair = c.sizes[sz];
      return pair && pair[0] > pair[1];
    });
    if (withRemainingSize) return withRemainingSize;
    const withSize = candidates.find((c) => Boolean(c.sizes[sz]));
    if (withSize) return withSize;
    const withAnyRemaining = candidates.find((c) => getOrdered(c) > getSold(c));
    return withAnyRemaining ?? candidates[0];
  };

  const allocateToItem = (target: ProductItem, sz: string, qty: number) => {
    let remaining = qty;
    const orderedSizes = Object.keys(target.sizes);
    // If file reported 'U' (Unica) on a multi-size garment, distribute into ordered sizes with stock first
    if (sz === 'U' && orderedSizes.length > 0 && !target.sizes['U']) {
      for (const sKey of orderedSizes) {
        if (remaining <= 0) break;
        const [o, s] = target.sizes[sKey];
        if (o > s) {
          const take = Math.min(remaining, o - s);
          target.sizes[sKey] = [o, s + take];
          remaining -= take;
        }
      }
      if (remaining > 0) {
        const firstKey = orderedSizes[0];
        const prev = target.sizes[firstKey];
        target.sizes[firstKey] = [prev[0], prev[1] + remaining];
      }
      return;
    }
    const prev = target.sizes[sz] ?? [0, 0];
    target.sizes[sz] = [prev[0], prev[1] + remaining];
  };

  let matchedUnits = 0;
  let unmatchedUnits = 0;
  const matchedSkus = new Set<string>();

  for (const line of lines) {
    const ns = normalizeStyleKey(line.style);
    const cs = compactStyleKey(line.style);
    const bs = baseStyleKey(line.style);
    const cc = normCc(line.colorCode);
    const sz = line.size || 'U';

    if (cc) {
      const target =
        pickBestCandidate(exactMap.get(`${ns}|${cc}`), sz) ??
        pickBestCandidate(compactMap.get(`${cs}|${cc}`), sz) ??
        pickBestCandidate(baseMap.get(`${bs}|${cc}`), sz);
      if (target) {
        allocateToItem(target, sz, line.qty);
        matchedUnits += line.qty;
        matchedSkus.add(`${target.name.toUpperCase()}|${target.cc}`);
        continue;
      }
    }

    const candidates =
      styleOnlyExact.get(ns) ??
      styleOnlyCompact.get(cs) ??
      styleOnlyBase.get(bs);

    if (candidates && candidates.length > 1) {
      // Distribute across colorways up to remaining stock when no colorCode was supplied
      let rem = line.qty;
      for (const cand of candidates) {
        if (rem <= 0) break;
        const pair = cand.sizes[sz];
        if (pair && pair[0] > pair[1]) {
          const take = Math.min(rem, pair[0] - pair[1]);
          allocateToItem(cand, sz, take);
          matchedSkus.add(`${cand.name.toUpperCase()}|${cand.cc}`);
          rem -= take;
        }
      }
      if (rem > 0) {
        for (const cand of candidates) {
          if (rem <= 0) break;
          const avail = Math.max(getOrdered(cand) - getSold(cand), 0);
          if (avail > 0) {
            const take = Math.min(rem, avail);
            allocateToItem(cand, sz, take);
            matchedSkus.add(`${cand.name.toUpperCase()}|${cand.cc}`);
            rem -= take;
          }
        }
      }
      if (rem > 0) {
        const fallbackTarget = pickBestCandidate(candidates, sz)!;
        allocateToItem(fallbackTarget, sz, rem);
        matchedSkus.add(`${fallbackTarget.name.toUpperCase()}|${fallbackTarget.cc}`);
      }
      matchedUnits += line.qty;
    } else if (candidates && candidates.length === 1) {
      const target = candidates[0];
      allocateToItem(target, sz, line.qty);
      matchedUnits += line.qty;
      matchedSkus.add(`${target.name.toUpperCase()}|${target.cc}`);
    } else {
      unmatchedUnits += line.qty;
    }
  }

  const nextStores = db.stores.map((st) =>
    st.id === storeId
      ? {
          ...st,
          unmatched: unmatchedUnits,
          soldTotal: matchedUnits + unmatchedUnits,
        }
      : st
  );

  return {
    db: {
      ...db,
      stores: nextStores,
      items: [...otherItems, ...storeItems],
    },
    matchedUnits,
    unmatchedUnits,
    totalUnits: matchedUnits + unmatchedUnits,
    matchedSkus: matchedSkus.size,
  };
}

export function applyJoorOrdersToDb(
  db: UnifiedDatabase,
  storeId: string,
  rows: ParsedJoorOrderRow[]
): { db: UnifiedDatabase; totalOrdered: number; skuCount: number } {
  const store = db.stores.find((s) => s.id === storeId);
  if (!store) {
    return { db, totalOrdered: 0, skuCount: 0 };
  }

  // Build image / line / category lookup from all existing DB items so JOOR photos are preserved
  const metaExact = new Map<string, { img: string | null; line: string }>();
  const metaStyle = new Map<string, { img: string | null; line: string }>();
  for (const it of db.items) {
    const ns = normalizeStyleKey(it.name);
    const cc = normCc(it.cc);
    if (it.img) {
      if (cc && !metaExact.has(`${ns}|${cc}`)) {
        metaExact.set(`${ns}|${cc}`, { img: it.img, line: it.line });
      }
      if (!metaStyle.has(ns)) {
        metaStyle.set(ns, { img: it.img, line: it.line });
      }
    }
  }

  const grouped = new Map<
    string,
    {
      item: ProductItem;
      poSet: Set<string>;
    }
  >();

  for (const r of rows) {
    const ns = normalizeStyleKey(r.styleName);
    const cc = normCc(r.colorCode) || r.colorCodeStr;
    const key = `${ns}|${cc}`;
    let entry = grouped.get(key);
    if (!entry) {
      const meta = metaExact.get(`${ns}|${normCc(r.colorCode)}`) ?? metaStyle.get(ns);
      entry = {
        item: {
          storeId: store.id,
          storeName: store.name,
          groupId: store.groupId,
          groupName: store.groupName,
          name: r.styleName,
          num: r.styleNumber,
          color: r.colorCodeStr || r.colorCode,
          cc: r.colorCode || normCc(r.colorCodeStr),
          cat: r.category || 'Apparel',
          line: meta?.line || 'Fw 2026 - Main Collection',
          img: meta?.img ?? null,
          whs: r.wholesaleEur,
          rtl: r.retailEur,
          po: r.poNumber,
          fab: r.fabrication,
          sizes: {},
        },
        poSet: new Set<string>(),
      };
      grouped.set(key, entry);
    }

    if (r.poNumber) entry.poSet.add(r.poNumber);
    if (r.wholesaleEur > 0) entry.item.whs = r.wholesaleEur;
    if (r.retailEur > 0) entry.item.rtl = r.retailEur;
    if (r.fabrication && !entry.item.fab) entry.item.fab = r.fabrication;

    for (const [sz, qty] of Object.entries(r.sizes)) {
      const prev = entry.item.sizes[sz] ?? [0, 0];
      entry.item.sizes[sz] = [prev[0] + qty, prev[1]];
    }
  }

  let totalOrdered = 0;
  const newStoreItems: ProductItem[] = [];
  for (const { item, poSet } of grouped.values()) {
    item.po = Array.from(poSet).join(', ');
    totalOrdered += getOrdered(item);
    newStoreItems.push(item);
  }

  const otherItems = db.items.filter((it) => it.storeId !== storeId);

  return {
    db: {
      ...db,
      items: [...otherItems, ...newStoreItems],
    },
    totalOrdered,
    skuCount: newStoreItems.length,
  };
}
