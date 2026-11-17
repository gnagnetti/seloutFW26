import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  LayoutGrid,
  Ruler,
  Search,
  Store,
  Table2,
  Tag,
  Upload,
} from 'lucide-react';
import {
  CategoryBreakdownView,
  SizeCurveView,
  StoresAndGroupsView,
  TableView,
} from './components/DataViews';
import { ImportModal } from './components/ImportModal';
import { KpiStrip } from './components/KpiStrip';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { StoreNavigator } from './components/StoreNavigator';
import type {
  AggregatedProductItem,
  CustomStoreGroup,
  FilterState,
  GroupId,
  Lang,
  PerformanceTier,
  ProductItem,
  SortOption,
  StoreRecord,
  UnifiedDatabase,
  ViewMode,
} from './types/retail';
import {
  aggregateModels,
  applyJoorOrdersToDb,
  exportUnifiedCsv,
  getOrdered,
  getSellOutPct,
  getSold,
  getTier,
  reconcileStoreSellOut,
  type ParsedJoorOrderRow,
  type ParsedSellOutLine,
} from './utils/analytics';
import { t } from './utils/i18n';

const CUSTOM_GROUPS_KEY = 'ls-fw26-custom-store-groups-v1';
const OVERRIDES_KEY = 'ls-fw26-store-overrides-v2';
const LEGACY_OVERRIDES_KEY = 'ls-fw26-sellout-overrides-v1';

interface StoreOverridesV2 {
  ordersByStore?: Record<string, ParsedJoorOrderRow[]>;
  sellOutByStore?: Record<string, ParsedSellOutLine[]>;
}

export default function App() {
  const [lang, setLang] = useState<Lang>('it');
  const [db, setDb] = useState<UnifiedDatabase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [activeGroupTab, setActiveGroupTab] = useState<'all' | GroupId | string>('all');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [customGroups, setCustomGroups] = useState<CustomStoreGroup[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_GROUPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    line: 'all',
    category: 'all',
    tier: 'all',
    po: 'all',
    sortBy: 'sold',
    aggregateModels: true,
  });

  const [selectedProduct, setSelectedProduct] = useState<
    ProductItem | AggregatedProductItem | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);

  const dict = t(lang);

  // Load unified database + apply any saved local orders / sell-out overrides
  const loadDatabase = async (applyOverrides = true) => {
    try {
      setLoadError(null);
      const res = await fetch('/data/unified-db.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data: UnifiedDatabase = await res.json();

      if (applyOverrides) {
        try {
          const rawOv = localStorage.getItem(OVERRIDES_KEY);
          if (rawOv) {
            const ov: StoreOverridesV2 = JSON.parse(rawOv);
            if (ov.ordersByStore) {
              for (const [storeId, rows] of Object.entries(ov.ordersByStore)) {
                if (Array.isArray(rows) && rows.length > 0) {
                  data = applyJoorOrdersToDb(data, storeId, rows).db;
                }
              }
            }
            if (ov.sellOutByStore) {
              for (const [storeId, lines] of Object.entries(ov.sellOutByStore)) {
                if (Array.isArray(lines) && lines.length > 0) {
                  data = reconcileStoreSellOut(data, storeId, lines).db;
                }
              }
            }
          }
        } catch {
          // ignore malformed localStorage override
        }
      }

      setDb(data);
      setSelectedStoreIds((prev) =>
        prev.length > 0 ? prev : data.stores.map((s) => s.id)
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Errore caricamento database');
    }
  };

  useEffect(() => {
    loadDatabase(true);
  }, []);

  const storesById = useMemo(() => {
    const map = new Map<string, StoreRecord>();
    if (db) {
      for (const s of db.stores) map.set(s.id, s);
    }
    return map;
  }, [db]);

  const selectedStoreSet = useMemo(() => new Set(selectedStoreIds), [selectedStoreIds]);

  const allLines = useMemo(() => {
    if (!db) return [];
    return Array.from(new Set(db.items.map((i) => i.line))).sort();
  }, [db]);

  // Items matching selected stores & selected collection line
  const scopedItems = useMemo(() => {
    if (!db) return [];
    return db.items.filter(
      (item) =>
        selectedStoreSet.has(item.storeId) &&
        (filters.line === 'all' || item.line === filters.line)
    );
  }, [db, selectedStoreSet, filters.line]);

  const unmatchedForScope = useMemo(() => {
    if (!db || filters.line !== 'all') return 0;
    return db.stores
      .filter((s) => selectedStoreSet.has(s.id))
      .reduce((sum, s) => sum + s.unmatched, 0);
  }, [db, selectedStoreSet, filters.line]);

  const allCategories = useMemo(() => {
    return Array.from(new Set(scopedItems.map((i) => i.cat))).sort();
  }, [scopedItems]);

  const allPOs = useMemo(() => {
    const set = new Set<string>();
    for (const item of scopedItems) {
      for (const p of item.po.split(',').map((x) => x.trim()).filter(Boolean)) {
        set.add(p);
      }
    }
    return Array.from(set).sort();
  }, [scopedItems]);

  const displayedItems = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const baseList: (ProductItem | AggregatedProductItem)[] =
      filters.aggregateModels && selectedStoreIds.length > 1
        ? aggregateModels(scopedItems, storesById, dict.allStores)
        : scopedItems;

    const filtered = baseList.filter((item) => {
      if (q) {
        const hay = `${item.name} ${item.num} ${item.color} ${item.fab} ${item.storeName} ${item.groupName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.category !== 'all' && item.cat !== filters.category) return false;
      if (filters.tier !== 'all' && getTier(item) !== filters.tier) return false;
      if (filters.po !== 'all') {
        const pos = item.po.split(',').map((p) => p.trim());
        if (!pos.includes(filters.po)) return false;
      }
      return true;
    });

    const getSortVal = (it: ProductItem) => {
      switch (filters.sortBy) {
        case 'sold':
          return -getSold(it);
        case 'pct':
          return -getSellOutPct(getSold(it), getOrdered(it));
        case 'units':
          return -getOrdered(it);
        case 'rtl':
          return -it.rtl;
        case 'whs':
          return -it.whs;
        case 'name':
          return it.name;
      }
    };

    return filtered.sort((a, b) => {
      const va = getSortVal(a);
      const vb = getSortVal(b);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return getSold(b) - getSold(a);
    });
  }, [
    scopedItems,
    filters,
    selectedStoreIds.length,
    storesById,
    dict.allStores,
  ]);

  const activeScopeSummary = useMemo(() => {
    if (!db) return '';
    if (selectedStoreIds.length === db.stores.length) {
      return `${dict.allStores} (${db.stores.length})`;
    }
    if (selectedStoreIds.length === 1) {
      const st = storesById.get(selectedStoreIds[0]);
      return st ? `${st.name} · ${st.groupName}` : selectedStoreIds[0];
    }
    const groupMatch = db.groups.find((g) => {
      const ids = db.stores.filter((s) => s.groupId === g.id).map((s) => s.id);
      return ids.length === selectedStoreIds.length && ids.every((id) => selectedStoreSet.has(id));
    });
    if (groupMatch) return `${groupMatch.name} (${selectedStoreIds.length} ${dict.card.storesCount})`;
    return `${selectedStoreIds.length} ${dict.storesSelected}`;
  }, [db, selectedStoreIds, selectedStoreSet, storesById, dict]);

  const handleSaveCustomGroup = (name: string, storeIds: string[]) => {
    const newGroup: CustomStoreGroup = {
      id: `custom-${Date.now()}`,
      name,
      storeIds,
    };
    const next = [...customGroups, newGroup];
    setCustomGroups(next);
    setActiveGroupTab(newGroup.id);
    localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(next));
  };

  const handleDeleteCustomGroup = (id: string) => {
    const next = customGroups.filter((g) => g.id !== id);
    setCustomGroups(next);
    if (activeGroupTab === id) setActiveGroupTab('all');
    localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(next));
  };

  const readOverrides = (): StoreOverridesV2 => {
    try {
      const raw = localStorage.getItem(OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const writeOverrides = (ov: StoreOverridesV2) => {
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(ov));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleApplySellOut = (storeId: string, lines: ParsedSellOutLine[]) => {
    if (!db) {
      return { matchedUnits: 0, unmatchedUnits: 0, totalUnits: 0, matchedSkus: 0 };
    }
    const res = reconcileStoreSellOut(db, storeId, lines);
    setDb(res.db);

    const ov = readOverrides();
    ov.sellOutByStore = { ...(ov.sellOutByStore || {}), [storeId]: lines };
    writeOverrides(ov);

    return {
      matchedUnits: res.matchedUnits,
      unmatchedUnits: res.unmatchedUnits,
      totalUnits: res.totalUnits,
      matchedSkus: res.matchedSkus,
    };
  };

  const handleApplyOrders = (storeId: string, rows: ParsedJoorOrderRow[]) => {
    if (!db) return 0;
    const prevStore = db.stores.find((s) => s.id === storeId);
    const ov = readOverrides();
    const savedSellOut = ov.sellOutByStore?.[storeId];

    // If no uploaded sell-out override exists yet, carry over current matched sell-out lines
    const fallbackLines: ParsedSellOutLine[] = [];
    if (!savedSellOut) {
      for (const item of db.items) {
        if (item.storeId !== storeId) continue;
        for (const [sz, [, sld]] of Object.entries(item.sizes)) {
          if (sld > 0) {
            fallbackLines.push({
              style: item.name,
              colorCode: item.cc,
              size: sz,
              qty: sld,
            });
          }
        }
      }
    }

    const orderRes = applyJoorOrdersToDb(db, storeId, rows);
    const linesToApply = savedSellOut ?? fallbackLines;
    let nextDb = orderRes.db;
    if (linesToApply.length > 0) {
      const reconciled = reconcileStoreSellOut(nextDb, storeId, linesToApply);
      nextDb = reconciled.db;
      if (!savedSellOut && prevStore && prevStore.unmatched > 0) {
        nextDb = {
          ...nextDb,
          stores: nextDb.stores.map((s) =>
            s.id === storeId
              ? {
                  ...s,
                  unmatched: s.unmatched + prevStore.unmatched,
                  soldTotal: reconciled.matchedUnits + s.unmatched + prevStore.unmatched,
                }
              : s
          ),
        };
      }
    }

    setDb(nextDb);
    ov.ordersByStore = { ...(ov.ordersByStore || {}), [storeId]: rows };
    writeOverrides(ov);

    return orderRes.totalOrdered;
  };

  const handleResetDatabase = () => {
    localStorage.removeItem(OVERRIDES_KEY);
    localStorage.removeItem(LEGACY_OVERRIDES_KEY);
    loadDatabase(false);
  };

  const navTabs: Array<[ViewMode, string, typeof LayoutGrid]> = [
    ['gallery', dict.tabs.gallery, LayoutGrid],
    ['table', dict.tabs.table, Table2],
    ['cats', dict.tabs.cats, Tag],
    ['sizes', dict.tabs.sizes, Ruler],
    ['stores', dict.tabs.stores, Store],
  ];

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {dict.brand}
          </h1>
          <p className="mt-2 text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => loadDatabase(true)}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground cursor-pointer"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
          <div className="h-44 animate-pulse rounded-xl bg-muted" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Bar following 3-zone contract */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-serif text-2xl font-semibold tracking-wider text-foreground whitespace-nowrap shrink-0"
          >
            {dict.brand}
          </a>

          <nav className="flex flex-wrap items-center gap-1">
            {navTabs.map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === mode
                    ? 'bg-background text-foreground shadow-xs ring-1 ring-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() =>
              exportUnifiedCsv(displayedItems, `luisa-spagnoli-fw26-sellout.csv`)
            }
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            {dict.exportCsv}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Workspace Context & Collection Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.18em] text-primary font-medium">
              {dict.subtitle}
            </div>
            <p className="text-sm text-muted-foreground">
              {dict.activeScope}{' '}
              <b className="text-foreground">{activeScopeSummary}</b> · FW 2026 ·{' '}
              <span className="font-mono text-xs">(Sell-Out / Sell-In) × 100</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="uppercase tracking-wider text-accent font-medium mr-1">
                {dict.collectionLabel}
              </span>
              {['all', ...allLines].map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, line }))}
                  className={`rounded px-2.5 py-1 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filters.line === line
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  {line === 'all' ? dict.allLines : line.replace('Fw 2026 - ', '')}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {dict.importData}
            </button>

            <div className="inline-flex rounded-md border border-border bg-muted/50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLang('it')}
                className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
                  lang === 'it'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                IT
              </button>
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
                  lang === 'ru'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                RU
              </button>
            </div>
          </div>
        </div>

        {/* Store & Group Navigator */}
        <StoreNavigator
          groups={db.groups}
          stores={db.stores}
          allItems={db.items}
          selectedStoreIds={selectedStoreIds}
          onChangeSelectedStoreIds={setSelectedStoreIds}
          activeGroupTab={activeGroupTab}
          onChangeGroupTab={setActiveGroupTab}
          customGroups={customGroups}
          onSaveCustomGroup={handleSaveCustomGroup}
          onDeleteCustomGroup={handleDeleteCustomGroup}
          lang={lang}
        />

        {/* 6 KPI Summary Cards */}
        <KpiStrip
          items={scopedItems}
          unmatchedSold={unmatchedForScope}
          activeStoreCount={selectedStoreIds.length}
          lang={lang}
        />

        {/* Active View Content */}
        {(viewMode === 'gallery' || viewMode === 'table') && (
          <>
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  placeholder={dict.filters.searchPlaceholder}
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dict.filters.category}:
                  <select
                    value={filters.category}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, category: e.target.value }))
                    }
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="all">{dict.filters.allCategories}</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dict.filters.tier}:
                  <select
                    value={filters.tier}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        tier: e.target.value as PerformanceTier,
                      }))
                    }
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="all">{dict.filters.allTiers}</option>
                    <option value="lead">{dict.filters.tierLead}</option>
                    <option value="mid">{dict.filters.tierMid}</option>
                    <option value="slow">{dict.filters.tierSlow}</option>
                    <option value="out">{dict.filters.tierOut}</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dict.filters.po}:
                  <select
                    value={filters.po}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, po: e.target.value }))
                    }
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="all">{dict.filters.allPos}</option>
                    {allPOs.map((p) => (
                      <option key={p} value={p}>
                        PO #{p}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dict.filters.sortBy}:
                  <select
                    value={filters.sortBy}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        sortBy: e.target.value as SortOption,
                      }))
                    }
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="sold">{dict.filters.sortSold}</option>
                    <option value="pct">{dict.filters.sortPct}</option>
                    <option value="units">{dict.filters.sortUnits}</option>
                    <option value="rtl">{dict.filters.sortRtl}</option>
                    <option value="whs">{dict.filters.sortWhs}</option>
                    <option value="name">{dict.filters.sortName}</option>
                  </select>
                </label>

                {selectedStoreIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        aggregateModels: !f.aggregateModels,
                      }))
                    }
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      filters.aggregateModels
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {dict.filters.aggregateToggle}
                  </button>
                )}

                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {dict.filters.showing}{' '}
                  <b className="text-foreground">
                    {displayedItems.length.toLocaleString('it-IT')}
                  </b>{' '}
                  {dict.filters.of}{' '}
                  {scopedItems.length.toLocaleString('it-IT')}
                </span>
              </div>
            </section>

            {displayedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <h3 className="font-serif text-xl font-semibold text-foreground">
                  {dict.empty.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dict.empty.desc}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      search: '',
                      line: 'all',
                      category: 'all',
                      tier: 'all',
                      po: 'all',
                      sortBy: 'sold',
                      aggregateModels: true,
                    })
                  }
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground cursor-pointer"
                >
                  {dict.filters.resetFilters}
                </button>
              </div>
            ) : viewMode === 'gallery' ? (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {displayedItems.slice(0, 200).map((item, idx) => (
                  <ProductCard
                    key={`${item.storeId}-${item.name}-${item.cc}-${idx}`}
                    item={item}
                    showStore={selectedStoreIds.length > 1 || filters.aggregateModels}
                    lang={lang}
                    onSelect={setSelectedProduct}
                  />
                ))}
              </section>
            ) : (
              <TableView
                items={displayedItems}
                showStore={selectedStoreIds.length > 1}
                lang={lang}
                onSelect={setSelectedProduct}
              />
            )}
          </>
        )}

        {viewMode === 'cats' && (
          <CategoryBreakdownView
            items={scopedItems}
            lang={lang}
            onSelectCategory={(cat) => {
              setFilters((f) => ({ ...f, category: cat }));
              setViewMode('gallery');
            }}
          />
        )}

        {viewMode === 'sizes' && (
          <SizeCurveView items={scopedItems} lang={lang} />
        )}

        {viewMode === 'stores' && (
          <StoresAndGroupsView
            groups={db.groups}
            stores={db.stores}
            allItems={db.items}
            lang={lang}
            onSelectGroup={(groupId) => {
              setActiveGroupTab(groupId);
              setSelectedStoreIds(
                db.stores.filter((s) => s.groupId === groupId).map((s) => s.id)
              );
              setViewMode('gallery');
            }}
            onSelectStore={(storeId) => {
              setSelectedStoreIds([storeId]);
              setViewMode('gallery');
            }}
          />
        )}
      </main>

      <ProductModal
        item={selectedProduct}
        allScopedItems={scopedItems}
        storesById={storesById}
        lang={lang}
        onClose={() => setSelectedProduct(null)}
      />

      <ImportModal
        isOpen={importOpen}
        stores={db.stores}
        defaultStoreId={selectedStoreIds[0] || db.stores[0]?.id || ''}
        lang={lang}
        onClose={() => setImportOpen(false)}
        onApplySellOut={handleApplySellOut}
        onApplyOrders={handleApplyOrders}
        onResetDatabase={handleResetDatabase}
      />
    </div>
  );
}
