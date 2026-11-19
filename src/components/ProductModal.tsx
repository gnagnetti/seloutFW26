import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AggregatedProductItem, Lang, ProductItem, StoreRecord } from '../types/retail';
import {
  formatEur,
  getOrdered,
  getSellOutPct,
  getSold,
  sortSizeEntries,
} from '../utils/analytics';
import { t } from '../utils/i18n';

interface ProductModalProps {
  item: ProductItem | AggregatedProductItem | null;
  allScopedItems: ProductItem[];
  storesById: Map<string, StoreRecord>;
  lang: Lang;
  onClose: () => void;
}

export function ProductModal({
  item,
  allScopedItems,
  storesById,
  lang,
  onClose,
}: ProductModalProps) {
  const dict = t(lang);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item?.img]);

  if (!item) return null;

  const ordered = getOrdered(item);
  const sold = getSold(item);
  const pct = getSellOutPct(sold, ordered);
  const sizeEntries = sortSizeEntries(item.sizes);

  const isAggregatedModel = 'colorBreakdown' in item && (item.colorBreakdown?.length ?? 0) > 0;
  const colorBreakdown = 'colorBreakdown' in item ? item.colorBreakdown ?? [] : [];
  const realizedRevenue =
    'realizedRevenue' in item && item.realizedRevenue !== undefined
      ? item.realizedRevenue
      : sold * item.rtl;

  // Build store breakdown across active scoped items
  const breakdown =
    'storeBreakdown' in item && item.storeBreakdown.length > 0
      ? item.storeBreakdown
      : (() => {
          const matching = allScopedItems.filter(
            (x) =>
              x.name.toUpperCase() === item.name.toUpperCase() &&
              (isAggregatedModel || x.cc === item.cc || x.color.toUpperCase() === item.color.toUpperCase())
          );
          return matching.map((m) => {
            const st = storesById.get(m.storeId);
            const o = getOrdered(m);
            const s = getSold(m);
            return {
              storeId: m.storeId,
              storeName: m.storeName,
              shortName: st?.shortName ?? m.storeName,
              groupName: m.groupName,
              ordered: o,
              sold: s,
              revenue: s * m.rtl,
              pct: getSellOutPct(s, o),
            };
          });
        })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.modal.close}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]">
          <div className="aspect-[4/5] bg-muted md:aspect-auto md:min-h-[420px]">
            {item.img && !imgError ? (
              <img
                src={item.img}
                alt={item.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-secondary via-muted to-background p-6 text-center">
                <span className="font-serif text-3xl font-semibold text-foreground/75">
                  {item.name}
                </span>
                <span className="mt-2 text-xs text-muted-foreground">{item.cat}</span>
              </div>
            )}
          </div>

          <div className="space-y-5 p-6">
            <div>
              <div className="text-xs text-muted-foreground">
                {item.cat} · {item.line}
              </div>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-foreground">
                {item.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.color}
                {item.num ? ` · ${dict.modal.styleNumber} #${item.num}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 border-y border-border py-4 sm:grid-cols-4 tabular-nums">
              <div>
                <div className="text-xs text-muted-foreground">Sell-In</div>
                <div className="mt-0.5 font-mono text-xl font-semibold">{ordered}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sell-Out</div>
                <div className="mt-0.5 font-mono text-xl font-semibold text-success">
                  {sold} ({pct.toFixed(1)}%)
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Retail / Wholesale</div>
                <div className="mt-0.5 font-mono text-base font-medium">
                  {formatEur(item.rtl)} / {formatEur(item.whs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{dict.table.revenue}</div>
                <div className="mt-0.5 font-mono text-base font-semibold">
                  {formatEur(realizedRevenue)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">{dict.modal.fabrication}: </span>
                {item.fab || '—'}
              </div>
              <div className="font-mono">
                <span className="font-sans font-medium text-foreground">
                  {dict.modal.poNumbers}:{' '}
                </span>
                {item.po || 'Floor Stock'}
              </div>
            </div>

            {(() => {
              const hasSizeExcess = sizeEntries.some(([, [o, s]]) => s > o);
              const hasStoreExcess = breakdown.some((b) => b.sold > b.ordered);
              if (sold <= ordered && !hasSizeExcess && !hasStoreExcess) return null;
              return (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  {dict.modal.transferNotice}
                </div>
              );
            })()}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {dict.modal.sizeMatrix}
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{dict.modal.size}</th>
                      <th className="px-3 py-2 text-right">Sell-In</th>
                      <th className="px-3 py-2 text-right">Sell-Out</th>
                      <th className="px-3 py-2 text-right">{dict.modal.remaining}</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeEntries.map(([sz, [ord, sld]]) => {
                      const szPct = getSellOutPct(sld, ord);
                      const extra = sld - ord;
                      return (
                        <tr key={sz} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono font-medium">{sz}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{ord}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-success font-medium">
                            {sld}
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right font-mono ${
                              extra > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'
                            }`}
                          >
                            {extra > 0 ? `0 (+${extra} ${dict.modal.excessTag})` : Math.max(ord - sld, 0)}
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right font-mono ${
                              extra > 0 ? 'text-primary font-semibold' : ''
                            }`}
                          >
                            {szPct.toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {colorBreakdown.length > 1 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dict.modal.colorBreakdown}
                </h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{dict.modal.color}</th>
                        <th className="px-3 py-2 text-right">Sell-In</th>
                        <th className="px-3 py-2 text-right">Sell-Out</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">{dict.table.revenue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colorBreakdown.map((c) => {
                        const extra = c.sold - c.ordered;
                        return (
                          <tr key={c.cc || c.color} className="border-t border-border">
                            <td className="px-3 py-1.5 font-medium">{c.color}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{c.ordered}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-success font-medium">
                              {c.sold}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono ${
                                extra > 0 ? 'text-primary font-semibold' : ''
                              }`}
                            >
                              {c.pct.toFixed(1)}%
                              {extra > 0 ? ` (+${extra})` : ''}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {formatEur(c.revenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {breakdown.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dict.modal.storeBreakdown}
                </h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{dict.table.store}</th>
                        <th className="px-3 py-2">{dict.table.group}</th>
                        <th className="px-3 py-2 text-right">Sell-In</th>
                        <th className="px-3 py-2 text-right">Sell-Out</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">{dict.table.revenue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((b) => {
                        const extra = b.sold - b.ordered;
                        return (
                          <tr key={b.storeId} className="border-t border-border">
                            <td className="px-3 py-1.5 font-medium">{b.shortName}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{b.groupName}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{b.ordered}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-success font-medium">
                              {b.sold}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono ${
                                extra > 0 ? 'text-primary font-semibold' : ''
                              }`}
                            >
                              {b.pct.toFixed(0)}%
                              {extra > 0 ? ` (+${extra})` : ''}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {formatEur(b.revenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
