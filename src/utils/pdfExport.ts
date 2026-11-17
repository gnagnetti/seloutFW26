import { jsPDF } from 'jspdf';
import type { AggregatedProductItem, Lang, ProductItem, ViewMode } from '../types/retail';
import {
  formatEur,
  getOrdered,
  getSellOutPct,
  getSold,
  getTier,
  sortSizeEntries,
} from './analytics';
import { t } from './i18n';

interface CachedFont {
  regularB64: string;
  boldB64: string;
}

interface NormalizedImage {
  dataUrl: string;
  width: number;
  height: number;
}

let cachedFonts: CachedFont | null = null;
const imageCache = new Map<string, NormalizedImage | null>();

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ensureUnicodeFonts(doc: jsPDF): Promise<string> {
  try {
    if (!cachedFonts) {
      const [regRes, boldRes] = await Promise.all([
        fetch('/fonts/LiberationSans-Regular.ttf'),
        fetch('/fonts/LiberationSans-Bold.ttf'),
      ]);
      if (!regRes.ok || !boldRes.ok) {
        return 'helvetica';
      }
      const [regBuf, boldBuf] = await Promise.all([
        regRes.arrayBuffer(),
        boldRes.arrayBuffer(),
      ]);
      cachedFonts = {
        regularB64: arrayBufferToBase64(regBuf),
        boldB64: arrayBufferToBase64(boldBuf),
      };
    }

    doc.addFileToVFS('LiberationSans-Regular.ttf', cachedFonts.regularB64);
    doc.addFont('LiberationSans-Regular.ttf', 'LibSans', 'normal');
    doc.addFileToVFS('LiberationSans-Bold.ttf', cachedFonts.boldB64);
    doc.addFont('LiberationSans-Bold.ttf', 'LibSans', 'bold');
    doc.setFont('LibSans', 'normal');
    return 'LibSans';
  } catch {
    return 'helvetica';
  }
}

async function blobToNormalizedJpeg(blob: Blob): Promise<NormalizedImage | null> {
  const MAX_W = 420;
  const MAX_H = 525;

  const drawCanvas = (
    source: CanvasImageSource,
    srcW: number,
    srcH: number
  ): NormalizedImage | null => {
    if (srcW <= 0 || srcH <= 0) return null;
    const scale = Math.min(1, MAX_W / srcW, MAX_H / srcH);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Warm off-white background so transparent PNGs print cleanly without dark fill
    ctx.fillStyle = '#F8F6F1';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      width: w,
      height: h,
    };
  };

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const result = drawCanvas(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (result) return result;
    } catch {
      // fall back to HTMLImageElement
    }
  }

  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objUrl;
    });
    return drawCanvas(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

async function fetchSinglePhoto(url: string): Promise<NormalizedImage | null> {
  if (imageCache.has(url)) {
    return imageCache.get(url) ?? null;
  }

  const endpoints = [
    `/api/image-proxy?url=${encodeURIComponent(url)}`,
    url,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size === 0) continue;
      const norm = await blobToNormalizedJpeg(blob);
      if (norm) {
        imageCache.set(url, norm);
        return norm;
      }
    } catch {
      // try next endpoint
    }
  }

  imageCache.set(url, null);
  return null;
}

async function preloadPhotos(
  urls: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, NormalizedImage>> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const result = new Map<string, NormalizedImage>();
  const total = unique.length;
  let done = 0;

  onProgress?.(0, total);
  if (total === 0) return result;

  const CONCURRENCY = 8;
  let cursor = 0;

  const worker = async () => {
    while (cursor < unique.length) {
      const idx = cursor++;
      const url = unique[idx];
      const img = await fetchSinglePhoto(url);
      if (img) result.set(url, img);
      done++;
      onProgress?.(done, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker())
  );

  return result;
}

function fitRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  };
}

function truncateToWidth(doc: jsPDF, text: string, maxW: number): string {
  const s = String(text || '');
  if (!s) return '';
  if (doc.getTextWidth(s) <= maxW) return s;
  let out = s;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

const TIER_COLORS: Record<'out' | 'lead' | 'mid' | 'slow', [number, number, number]> = {
  out: [122, 30, 46],   // burgundy
  lead: [27, 107, 68],  // forest green
  mid: [180, 128, 18],  // warm gold
  slow: [115, 108, 100], // warm stone
};

export interface ExportCatalogPdfOptions {
  items: (ProductItem | AggregatedProductItem)[];
  viewMode: ViewMode;
  scopeSummary: string;
  filterSummary: string;
  showStore: boolean;
  lang: Lang;
  onProgress?: (done: number, total: number) => void;
}

export async function exportCatalogPdf({
  items,
  viewMode,
  scopeSummary,
  filterSummary,
  showStore,
  lang,
  onProgress,
}: ExportCatalogPdfOptions): Promise<{ totalItems: number; embeddedPhotos: number }> {
  const dict = t(lang);
  const isTable = viewMode === 'table';

  const photoUrls = items
    .map((i) => i.img)
    .filter((u): u is string => Boolean(u));

  const photos = await preloadPhotos(photoUrls, onProgress);

  const doc = new jsPDF({
    orientation: isTable ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const fontName = await ensureUnicodeFonts(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  let totalOrd = 0;
  let totalSld = 0;
  let totalRev = 0;
  for (const it of items) {
    const o = getOrdered(it);
    const s = getSold(it);
    totalOrd += o;
    totalSld += s;
    totalRev +=
      'realizedRevenue' in it && it.realizedRevenue !== undefined
        ? it.realizedRevenue
        : s * it.rtl;
  }
  const totalPct = getSellOutPct(totalSld, totalOrd);
  const dateStr = new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'it-IT');

  const drawPageHeader = (pageNum: number, totalPages: number) => {
    doc.setFillColor(248, 245, 239);
    doc.rect(margin, margin, pageW - margin * 2, 16, 'F');
    doc.setDrawColor(218, 210, 196);
    doc.setLineWidth(0.25);
    doc.rect(margin, margin, pageW - margin * 2, 16, 'S');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(38, 30, 26);
    doc.text(`${dict.brand} · FW 2026`, margin + 3, margin + 5.8);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(98, 90, 82);
    const subLine = truncateToWidth(
      doc,
      `${scopeSummary}${filterSummary ? ` · ${filterSummary}` : ''}`,
      pageW - margin * 2 - 85
    );
    doc.text(subLine, margin + 3, margin + 10.6);

    const kpiRight = `${dict.breakdown.sellIn}: ${totalOrd.toLocaleString('it-IT')}  ·  ${dict.card.sold}: ${totalSld.toLocaleString('it-IT')} (${totalPct.toFixed(1)}%)  ·  ${formatEur(totalRev)}`;
    doc.setFont(fontName, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(122, 30, 46);
    doc.text(kpiRight, pageW - margin - 3, margin + 5.8, { align: 'right' });

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(115, 108, 100);
    doc.text(
      `${items.length} SKU · ${dateStr} · Pag. ${pageNum}/${totalPages}`,
      pageW - margin - 3,
      margin + 10.6,
      { align: 'right' }
    );
  };

  if (isTable) {
    // Landscape A4 photo + data table (8 rows/page)
    const rowsPerPage = 8;
    const totalPages = Math.max(1, Math.ceil(items.length / rowsPerPage));
    const tableTop = margin + 19;
    const rowH = 21;
    const colWidths = [16, 46, 36, 26, 42, 22, 15, 15, 13, 18, 18, 20];
    // sum = 277mm (pageW 297 - 20 = 277mm)
    const headers = [
      'Foto',
      dict.table.model,
      dict.table.color,
      dict.table.category,
      showStore ? dict.table.store : dict.modal.fabrication,
      dict.table.po,
      dict.table.sellIn,
      dict.table.sellOut,
      dict.table.pct,
      dict.table.retail,
      dict.table.wholesale,
      dict.table.revenue,
    ];

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();
      drawPageHeader(page + 1, totalPages);

      // Table column headers
      doc.setFillColor(238, 232, 222);
      doc.rect(margin, tableTop, pageW - margin * 2, 7, 'F');
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(65, 58, 52);
      let cx = margin;
      headers.forEach((h, i) => {
        const isNum = i >= 6;
        doc.text(
          truncateToWidth(doc, h, colWidths[i] - 2),
          isNum ? cx + colWidths[i] - 1.5 : cx + 1.5,
          tableTop + 4.7,
          { align: isNum ? 'right' : 'left' }
        );
        cx += colWidths[i];
      });

      const slice = items.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
      slice.forEach((item, idx) => {
        const y = tableTop + 7 + idx * rowH;
        const ord = getOrdered(item);
        const sld = getSold(item);
        const pct = getSellOutPct(sld, ord);

        if (idx % 2 === 1) {
          doc.setFillColor(251, 249, 246);
          doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
        }
        doc.setDrawColor(228, 222, 212);
        doc.setLineWidth(0.2);
        doc.line(margin, y + rowH, pageW - margin, y + rowH);

        // Photo thumbnail
        const photo = item.img ? photos.get(item.img) : undefined;
        const px = margin + 1;
        const py = y + 1.5;
        const pw = 14;
        const ph = 18;
        doc.setFillColor(242, 238, 230);
        doc.rect(px, py, pw, ph, 'F');
        if (photo) {
          const r = fitRect(photo.width, photo.height, px, py, pw, ph);
          try {
            doc.addImage(photo.dataUrl, 'JPEG', r.x, r.y, r.w, r.h);
          } catch {
            // ignore image draw errors
          }
        }

        const sizeStr = sortSizeEntries(item.sizes)
          .map(([sz, [o, s]]) => `${sz}:${s}/${o}`)
          .join(' ');

        const vals = [
          '',
          `${item.name}${item.num ? ` #${item.num}` : ''}`,
          item.color,
          item.cat,
          showStore ? `${item.storeName}` : item.fab || item.line,
          item.po || '—',
          String(ord),
          String(sld),
          `${pct.toFixed(1)}%`,
          formatEur(item.rtl),
          formatEur(item.whs),
          formatEur(
            'realizedRevenue' in item && item.realizedRevenue !== undefined
              ? item.realizedRevenue
              : sld * item.rtl
          ),
        ];

        let rx = margin;
        vals.forEach((v, cIdx) => {
          if (cIdx === 0) {
            rx += colWidths[cIdx];
            return;
          }
          const isNum = cIdx >= 6;
          doc.setFont(fontName, cIdx === 1 || cIdx === 7 ? 'bold' : 'normal');
          if (cIdx === 7) doc.setTextColor(27, 107, 68);
          else doc.setTextColor(38, 30, 26);
          doc.setFontSize(7.2);

          if (cIdx === 1) {
            doc.text(truncateToWidth(doc, v, colWidths[cIdx] - 3), rx + 1.5, y + 6.5);
            doc.setFont(fontName, 'normal');
            doc.setFontSize(6);
            doc.setTextColor(115, 108, 100);
            const sizeLines = doc.splitTextToSize(sizeStr, colWidths[cIdx] - 3) as string[];
            sizeLines.slice(0, 2).forEach((ln, li) => {
              doc.text(ln, rx + 1.5, y + 11.2 + li * 3.4);
            });
          } else {
            doc.text(
              truncateToWidth(doc, v, colWidths[cIdx] - 3),
              isNum ? rx + colWidths[cIdx] - 1.5 : rx + 1.5,
              y + 10.5,
              { align: isNum ? 'right' : 'left' }
            );
          }
          rx += colWidths[cIdx];
        });
      });
    }
  } else {
    // Portrait A4 3x2 gallery cards (6 cards/page) with large product photos + complete data below
    const cols = 3;
    const rowsPerPage = 2;
    const cardsPerPage = cols * rowsPerPage;
    const gapX = 5;
    const gapY = 5;
    const gridTop = margin + 19;
    const cardW = (pageW - margin * 2 - gapX * (cols - 1)) / cols; // ~60mm
    const cardH = (pageH - gridTop - margin - gapY * (rowsPerPage - 1)) / rowsPerPage; // ~126.5mm
    const photoH = 68;
    const totalPages = Math.max(1, Math.ceil(items.length / cardsPerPage));

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();
      drawPageHeader(page + 1, totalPages);

      const slice = items.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
      slice.forEach((item, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = margin + col * (cardW + gapX);
        const y = gridTop + row * (cardH + gapY);

        const ord = getOrdered(item);
        const sld = getSold(item);
        const pct = getSellOutPct(sld, ord);
        const tier = getTier(item);
        const tierColor = TIER_COLORS[tier];
        const tierLabel = `${dict.tiers[tier]} · ${pct.toFixed(1)}%`;

        // Card outer container
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(218, 210, 196);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

        // Photo frame at top of card
        doc.setFillColor(246, 243, 236);
        doc.rect(x + 0.5, y + 0.5, cardW - 1, photoH, 'F');

        const photo = item.img ? photos.get(item.img) : undefined;
        if (photo) {
          const r = fitRect(
            photo.width,
            photo.height,
            x + 1,
            y + 1,
            cardW - 2,
            photoH - 2
          );
          try {
            doc.addImage(photo.dataUrl, 'JPEG', r.x, r.y, r.w, r.h);
          } catch {
            // fallback text below if corrupted image
          }
        } else {
          doc.setFont(fontName, 'bold');
          doc.setFontSize(10);
          doc.setTextColor(130, 122, 114);
          doc.text(truncateToWidth(doc, item.name, cardW - 8), x + cardW / 2, y + photoH / 2 - 2, {
            align: 'center',
          });
          doc.setFont(fontName, 'normal');
          doc.setFontSize(7);
          doc.text(item.cat, x + cardW / 2, y + photoH / 2 + 4, { align: 'center' });
        }

        // Category pill (top-left) & Tier badge (top-right)
        doc.setFont(fontName, 'bold');
        doc.setFontSize(6);
        const catTxt = truncateToWidth(doc, item.cat, 24);
        const catW = doc.getTextWidth(catTxt) + 3.5;
        doc.setFillColor(252, 250, 246);
        doc.roundedRect(x + 2, y + 2, catW, 4.4, 0.8, 0.8, 'F');
        doc.setTextColor(45, 38, 34);
        doc.text(catTxt, x + 3.7, y + 5.0);

        const badgeW = doc.getTextWidth(tierLabel) + 3.5;
        doc.setFillColor(...tierColor);
        doc.roundedRect(x + cardW - badgeW - 2, y + 2, badgeW, 4.4, 0.8, 0.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(tierLabel, x + cardW - badgeW / 2 - 2, y + 5.0, { align: 'center' });

        // Data block below photo
        let ty = y + photoH + 4.5;
        const padX = x + 3;
        const innerW = cardW - 6;

        // Model title
        doc.setFont(fontName, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(34, 28, 24);
        doc.text(truncateToWidth(doc, item.name, innerW), padX, ty);
        ty += 3.8;

        // Color + style num
        doc.setFont(fontName, 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(108, 100, 92);
        const colorLine = `${item.color}${item.num ? ` · #${item.num}` : ''}`;
        doc.text(truncateToWidth(doc, colorLine, innerW), padX, ty);
        ty += 3.6;

        // Store / Group if shown
        if (showStore) {
          doc.setFont(fontName, 'bold');
          doc.setFontSize(6.6);
          doc.setTextColor(122, 30, 46);
          doc.text(
            truncateToWidth(doc, `${item.storeName} · ${item.groupName}`, innerW),
            padX,
            ty
          );
          ty += 3.8;
        } else {
          ty += 1.2;
        }

        // Sold / Ordered row
        doc.setFont(fontName, 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(27, 107, 68);
        doc.text(`${dict.card.sold}: ${sld} ${dict.card.pcs}`, padX, ty);

        doc.setFont(fontName, 'normal');
        doc.setTextColor(65, 58, 52);
        doc.text(`${dict.card.ordered}: ${ord}`, x + cardW - 3, ty, { align: 'right' });
        ty += 1.8;

        // Progress bar
        doc.setFillColor(235, 230, 222);
        doc.rect(padX, ty, innerW, 1.4, 'F');
        doc.setFillColor(...tierColor);
        const barW = Math.max(0, Math.min(innerW, (innerW * Math.min(pct, 100)) / 100));
        if (barW > 0) doc.rect(padX, ty, barW, 1.4, 'F');
        ty += 4.2;

        // Retail / Wholesale row
        doc.setFont(fontName, 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(108, 100, 92);
        doc.text(dict.card.retailWhs, padX, ty);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(34, 28, 24);
        doc.text(
          `${formatEur(item.rtl)} / ${formatEur(item.whs)}`,
          x + cardW - 3,
          ty,
          { align: 'right' }
        );
        ty += 4.0;

        // Size breakdown grid lines
        const sizeText = sortSizeEntries(item.sizes)
          .map(([sz, [o, s]]) => `${sz}:${s}/${o}`)
          .join('  ');
        doc.setFont(fontName, 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(58, 52, 46);
        const sizeLines = doc.splitTextToSize(sizeText, innerW) as string[];
        sizeLines.slice(0, 4).forEach((ln, li) => {
          doc.text(ln, padX, ty + li * 3.1);
        });

        // Footer PO & collection line
        doc.setFont(fontName, 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(130, 122, 114);
        const footerLine = truncateToWidth(
          doc,
          `${item.po ? `PO# ${item.po}` : 'Floor Stock'} · ${item.line}`,
          innerW
        );
        doc.text(footerLine, padX, y + cardH - 2.6);
      });
    }
  }

  const slug = viewMode === 'table' ? 'tabella' : 'catalogo-foto';
  doc.save(`luisa-spagnoli-fw26-${slug}.pdf`);

  return { totalItems: items.length, embeddedPhotos: photos.size };
}
