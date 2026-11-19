import type {
  AggregatedProductItem,
  GroupId,
  GroupRecord,
  Lang,
  ProductItem,
  StoreRecord,
} from '../types/retail';
import {
  SIZE_ORDER,
  formatEur,
  getOrdered,
  getSellOutPct,
  getSold,
} from '../utils/analytics';
import { t } from '../utils/i18n';

interface TableViewProps {
  items: (ProductItem | AggregatedProductItem)[];
  showStore: boolean;
  lang: Lang;
  onSelect: (item: ProductItem | AggregatedProductItem) => void;
}

export function TableView({ items, showStore, lang, onSelect }: TableViewProps) {
  const dict = t(lang);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5">{dict.table.model}</th>
            <th className="px-3 py-2.5">{dict.table.color}</th>
            <th className="px-3 py-2.5">{dict.table.category}</th>
            {showStore && <th className="px-3 py-2.5">{dict.table.store}</th>}
            {showStore && <th className="px-3 py-2.5">{dict.table.group}</th>}
            <th className="px-3 py-2.5">{dict.table.po}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.sellIn}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.sellOut}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.pct}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.retail}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.wholesale}</th>
            <th className="px-3 py-2.5 text-right">{dict.table.revenue}</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 400).map((item, idx) => {
            const ord = getOrdered(item);
            const sld = getSold(item);
            const pct = getSellOutPct(sld, ord);
            return (
              <tr
                key={`${item.storeId}-${item.name}-${item.cc}-${idx}`}
                onClick={() => onSelect(item)}
                className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2 font-medium text-foreground">
                  {item.name}
                  {item.num && (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                      #{item.num}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.color}</td>
                <td className="px-3 py-2">{item.cat}</td>
                {showStore && <td className="px-3 py-2">{item.storeName}</td>}
                {showStore && (
                  <td className="px-3 py-2 text-muted-foreground">{item.groupName}</td>
                )}
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {item.po || '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono">{ord}</td>
                <td className="px-3 py-2 text-right font-mono text-success font-medium">
                  {sld}
                </td>
                <td className="px-3 py-2 text-right font-mono">{pct.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right font-mono">{formatEur(item.rtl)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                  {formatEur(item.whs)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium">
                  {formatEur(
                    'realizedRevenue' in item && item.realizedRevenue !== undefined
                      ? item.realizedRevenue
                      : sld * item.rtl
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface BreakdownRow {
  key: string;
  ordered: number;
  sold: number;
  revenue: number;
}

function HorizontalBarList({
  rows,
  label,
  lang,
  onSelectRow,
}: {
  rows: BreakdownRow[];
  label: string;
  lang: Lang;
  onSelectRow?: (key: string) => void;
}) {
  const dict = t(lang);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-[1.4fr_80px_80px_120px_2fr] gap-3 text-xs uppercase text-muted-foreground">
        <span>{label}</span>
        <span className="text-right">{dict.breakdown.sellIn}</span>
        <span className="text-right">{dict.breakdown.totalSold}</span>
        <span className="text-right">{dict.breakdown.revenue}</span>
        <span>{dict.breakdown.sellOutBar}</span>
      </div>
      {rows.map((row) => {
        const pct = getSellOutPct(row.sold, row.ordered);
        return (
          <div
            key={row.key}
            onClick={() => onSelectRow?.(row.key)}
            className={`grid grid-cols-[1.4fr_80px_80px_120px_2fr] items-center gap-3 border-t border-border pt-2.5 text-sm tabular-nums ${
              onSelectRow ? 'hover:bg-muted/40 rounded px-1 -mx-1 cursor-pointer' : ''
            }`}
          >
            <span className="font-medium text-foreground truncate">{row.key}</span>
            <span className="text-right font-mono">{row.ordered.toLocaleString('it-IT')}</span>
            <span className="text-right font-mono text-success font-medium">
              {row.sold.toLocaleString('it-IT')}
            </span>
            <span className="text-right font-mono">
              {row.revenue > 0 ? formatEur(row.revenue) : '—'}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="w-12 text-right font-mono text-xs">{pct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CategoryBreakdownView({
  items,
  lang,
  onSelectCategory,
}: {
  items: ProductItem[];
  lang: Lang;
  onSelectCategory: (cat: string) => void;
}) {
  const dict = t(lang);
  const map = new Map<string, BreakdownRow>();
  for (const item of items) {
    const cur = map.get(item.cat) ?? { key: item.cat, ordered: 0, sold: 0, revenue: 0 };
    const ord = getOrdered(item);
    const sld = getSold(item);
    cur.ordered += ord;
    cur.sold += sld;
    cur.revenue += sld * item.rtl;
    map.set(item.cat, cur);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.ordered - a.ordered);
  return (
    <HorizontalBarList
      rows={rows}
      label={dict.breakdown.category}
      lang={lang}
      onSelectRow={onSelectCategory}
    />
  );
}

export function SizeCurveView({ items, lang }: { items: ProductItem[]; lang: Lang }) {
  const dict = t(lang);
  const map = new Map<string, { ordered: number; sold: number }>();
  for (const item of items) {
    for (const [sz, [ord, sld]] of Object.entries(item.sizes)) {
      const key = sz.toUpperCase();
      const cur = map.get(key) ?? { ordered: 0, sold: 0 };
      cur.ordered += ord;
      cur.sold += sld;
      map.set(key, cur);
    }
  }
  const rows: BreakdownRow[] = Array.from(map.entries())
    .sort(([a], [b]) => {
      const ia = SIZE_ORDER.indexOf(a);
      const ib = SIZE_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([key, v]) => ({
      key,
      ordered: v.ordered,
      sold: v.sold,
      revenue: 0,
    }));

  return <HorizontalBarList rows={rows} label={dict.breakdown.size} lang={lang} />;
}

export function StoresAndGroupsView({
  groups,
  stores,
  allItems,
  isLineFiltered = false,
  lang,
  onSelectGroup,
  onSelectStore,
}: {
  groups: GroupRecord[];
  stores: StoreRecord[];
  allItems: ProductItem[];
  isLineFiltered?: boolean;
  lang: Lang;
  onSelectGroup: (groupId: GroupId) => void;
  onSelectStore: (storeId: string) => void;
}) {
  const dict = t(lang);

  const groupMetrics = groups.map((group) => {
    const gStores = stores.filter((s) => s.groupId === group.id);
    const gItems = allItems.filter((i) => i.groupId === group.id);
    let ordered = 0;
    let matchedSold = 0;
    let revenue = 0;
    let wholesale = 0;
    for (const item of gItems) {
      const o = getOrdered(item);
      const s = getSold(item);
      ordered += o;
      matchedSold += s;
      revenue += s * item.rtl;
      wholesale += o * item.whs;
    }
    const unmatched = isLineFiltered
      ? 0
      : gStores.reduce((sum, st) => sum + st.unmatched, 0);
    const totalSold = matchedSold + unmatched;
    const pct = getSellOutPct(matchedSold, ordered);
    return {
      group,
      storeCount: gStores.length,
      skuCount: gItems.length,
      ordered,
      matchedSold,
      unmatched,
      totalSold,
      revenue,
      wholesale,
      pct,
    };
  });

  const storeMetrics = stores.map((store) => {
    const sItems = allItems.filter((i) => i.storeId === store.id);
    let ordered = 0;
    let matchedSold = 0;
    let revenue = 0;
    let wholesale = 0;
    for (const item of sItems) {
      const o = getOrdered(item);
      const s = getSold(item);
      ordered += o;
      matchedSold += s;
      revenue += s * item.rtl;
      wholesale += o * item.whs;
    }
    const totalSold = isLineFiltered
      ? matchedSold
      : store.soldTotal > matchedSold
        ? store.soldTotal
        : matchedSold;
    const pct = getSellOutPct(matchedSold, ordered);
    return {
      store,
      skuCount: sItems.length,
      ordered,
      matchedSold,
      totalSold,
      revenue,
      wholesale,
      pct,
    };
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-xl font-semibold text-foreground">
          {dict.breakdown.groupTitle}
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">{dict.table.group}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.storesCount}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.skus}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.sellIn}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.matchedSold}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.unmatched}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.totalSold}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.sellOutBar}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.revenue}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.wholesale}</th>
              </tr>
            </thead>
            <tbody>
              {groupMetrics.map((m) => (
                <tr
                  key={m.group.id}
                  onClick={() => onSelectGroup(m.group.id)}
                  className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-foreground">{m.group.name}</div>
                    <div className="text-xs text-muted-foreground">{m.group.region}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{m.storeCount}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {m.skuCount.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {m.ordered.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-success font-medium">
                    {m.matchedSold.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                    {m.unmatched}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {m.totalSold.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{m.pct.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium">
                    {formatEur(m.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                    {formatEur(m.wholesale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-xl font-semibold text-foreground">
          {dict.breakdown.storeTitle}
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">{dict.table.store}</th>
                <th className="px-3 py-2.5">{dict.table.group}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.skus}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.sellIn}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.matchedSold}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.totalSold}</th>
                <th className="px-3 py-2.5 text-right">{dict.breakdown.revenue}</th>
                <th className="px-3 py-2.5">{dict.breakdown.sellOutBar}</th>
              </tr>
            </thead>
            <tbody>
              {storeMetrics.map((m) => (
                <tr
                  key={m.store.id}
                  onClick={() => onSelectStore(m.store.id)}
                  className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{m.store.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.store.city} · {m.store.code}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.store.groupName}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{m.skuCount}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {m.ordered.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-success font-medium">
                    {m.matchedSold.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {m.totalSold.toLocaleString('it-IT')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatEur(m.revenue)}
                  </td>
                  <td className="px-3 py-2.5 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(m.pct, 100)}%` }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono text-xs">
                        {m.pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
