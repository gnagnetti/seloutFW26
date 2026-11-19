import { useEffect, useState } from 'react';
import type { AggregatedProductItem, Lang, ProductItem } from '../types/retail';
import {
  formatEur,
  getOrdered,
  getSellOutPct,
  getSold,
  getTier,
  sortSizeEntries,
} from '../utils/analytics';
import { t } from '../utils/i18n';

interface ProductCardProps {
  item: ProductItem | AggregatedProductItem;
  showStore: boolean;
  lang: Lang;
  onSelect: (item: ProductItem | AggregatedProductItem) => void;
}

const TIER_STYLES = {
  out: 'bg-primary text-primary-foreground',
  lead: 'bg-success text-primary-foreground',
  mid: 'bg-warning text-accent-foreground',
  slow: 'bg-muted text-muted-foreground',
} as const;

export function ProductCard({ item, showStore, lang, onSelect }: ProductCardProps) {
  const dict = t(lang);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item.img]);

  const ordered = getOrdered(item);
  const sold = getSold(item);
  const pct = getSellOutPct(sold, ordered);
  const tier = getTier(item);
  const tierLabel = dict.tiers[tier];
  const sizeEntries = sortSizeEntries(item.sizes);

  return (
    <article
      onClick={() => onSelect(item)}
      className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent cursor-pointer flex flex-col"
    >
      <div className="relative aspect-[4/5] bg-muted overflow-hidden">
        {item.img && !imgError ? (
          <img
            src={item.img}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-secondary via-muted to-background px-4 text-center">
            <span className="font-serif text-2xl font-medium text-foreground/70">
              {item.name}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">{item.cat}</span>
          </div>
        )}

        <span className="absolute left-2.5 top-2.5 rounded bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-xs">
          {item.cat}
        </span>
        <span
          className={`absolute right-2.5 top-2.5 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${TIER_STYLES[tier]}`}
        >
          {tierLabel} · {pct.toFixed(1)}%
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between space-y-2.5 p-4">
        <div>
          <h3 className="font-serif text-xl font-semibold leading-snug text-foreground">
            {item.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.color}
            {item.num ? ` · #${item.num}` : ''}
          </p>
          {showStore && (
            <p className="mt-1 text-xs font-medium text-primary truncate">
              {item.storeName} · {item.groupName}
            </p>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-sm tabular-nums">
            <span>
              {dict.card.sold}:{' '}
              <b className="text-success font-semibold">
                {sold} {dict.card.pcs}
              </b>
            </span>
            <span className="text-muted-foreground">
              {dict.card.ordered}: <b className="text-foreground font-medium">{ordered}</b>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>{dict.card.retailWhs}</span>
            <span className="font-mono text-foreground">
              {formatEur(item.rtl)} / {formatEur(item.whs)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 font-mono text-[11px] tabular-nums">
            {sizeEntries.map(([sz, [ord, sld]]) => (
              <span
                key={sz}
                className={`rounded px-1.5 py-0.5 ${
                  sld > 0
                    ? 'bg-success/12 text-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {sz}:{sld}/{ord}
              </span>
            ))}
          </div>

          <p className="font-mono text-[10px] text-muted-foreground truncate pt-0.5">
            {item.po ? `PO# ${item.po}` : 'Floor Stock'} · {item.line}
          </p>
        </div>
      </div>
    </article>
  );
}
