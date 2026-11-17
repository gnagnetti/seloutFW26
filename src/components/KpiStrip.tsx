import type { Lang, ProductItem } from '../types/retail';
import { formatEur, getOrdered, getSellOutPct, getSold, getTier } from '../utils/analytics';
import { t } from '../utils/i18n';
import { RadialGauge } from './RadialGauge';

interface KpiStripProps {
  items: ProductItem[];
  unmatchedSold: number;
  activeStoreCount: number;
  lang: Lang;
}

export function KpiStrip({ items, unmatchedSold, activeStoreCount, lang }: KpiStripProps) {
  const dict = t(lang);

  let totalOrdered = 0;
  let totalMatchedSold = 0;
  let actualRevenue = 0;
  let potentialRevenue = 0;
  let wholesaleValue = 0;
  let leadersCount = 0;
  let slowCount = 0;
  const poSet = new Set<string>();

  for (const item of items) {
    const ord = getOrdered(item);
    const sld = getSold(item);
    totalOrdered += ord;
    totalMatchedSold += sld;
    actualRevenue += sld * item.rtl;
    potentialRevenue += ord * item.rtl;
    wholesaleValue += ord * item.whs;

    const tier = getTier(item);
    if (tier === 'lead' || tier === 'out') leadersCount++;
    if (tier === 'slow') slowCount++;

    for (const p of item.po.split(',').map((x) => x.trim()).filter(Boolean)) {
      poSet.add(p);
    }
  }

  const pct = getSellOutPct(totalMatchedSold, totalOrdered);
  const markup = wholesaleValue > 0 ? (potentialRevenue / wholesaleValue).toFixed(1) : '0.0';
  const remaining = Math.max(totalOrdered - totalMatchedSold, 0);

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.sellOutPct}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {pct.toFixed(1)}%
          </div>
          <RadialGauge value={pct} size={44} />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{dict.kpi.target70}</div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.soldOrdered}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {totalMatchedSold.toLocaleString('it-IT')} / {totalOrdered.toLocaleString('it-IT')}
        </div>
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {dict.kpi.remaining}: {remaining.toLocaleString('it-IT')} {dict.card.pcs}
          {unmatchedSold > 0 ? ` (+${unmatchedSold} extra)` : ''}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.realizedRev}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {formatEur(actualRevenue)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {dict.kpi.potential}: {formatEur(potentialRevenue)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.wholesaleVal}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {formatEur(wholesaleValue)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {dict.kpi.markup} ~{markup}x
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.assortment}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {items.length.toLocaleString('it-IT')}
        </div>
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {poSet.size} {dict.kpi.skusAndPos} · {activeStoreCount} {dict.card.storesCount}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">{dict.kpi.leaders}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {leadersCount.toLocaleString('it-IT')}
        </div>
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {slowCount.toLocaleString('it-IT')} {dict.kpi.below40}
        </div>
      </div>
    </section>
  );
}
