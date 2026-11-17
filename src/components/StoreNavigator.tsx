import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FolderPlus, MapPin, Trash2 } from 'lucide-react';
import type {
  CustomStoreGroup,
  GroupId,
  GroupRecord,
  Lang,
  ProductItem,
  StoreRecord,
} from '../types/retail';
import { getOrdered, getSellOutPct, getSold } from '../utils/analytics';
import { t } from '../utils/i18n';
import { RadialGauge } from './RadialGauge';

interface StoreNavigatorProps {
  groups: GroupRecord[];
  stores: StoreRecord[];
  allItems: ProductItem[];
  selectedStoreIds: string[];
  onChangeSelectedStoreIds: (ids: string[]) => void;
  activeGroupTab: 'all' | GroupId | string;
  onChangeGroupTab: (tab: 'all' | GroupId | string) => void;
  customGroups: CustomStoreGroup[];
  onSaveCustomGroup: (name: string, storeIds: string[]) => void;
  onDeleteCustomGroup: (id: string) => void;
  lang: Lang;
}

export function StoreNavigator({
  groups,
  stores,
  allItems,
  selectedStoreIds,
  onChangeSelectedStoreIds,
  activeGroupTab,
  onChangeGroupTab,
  customGroups,
  onSaveCustomGroup,
  onDeleteCustomGroup,
  lang,
}: StoreNavigatorProps) {
  const dict = t(lang);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Compute Sell-In & Matched Sell-Out per store
  const storeStats = new Map<string, { ordered: number; matchedSold: number }>();
  for (const st of stores) {
    storeStats.set(st.id, { ordered: 0, matchedSold: 0 });
  }
  for (const item of allItems) {
    const cur = storeStats.get(item.storeId);
    if (cur) {
      cur.ordered += getOrdered(item);
      cur.matchedSold += getSold(item);
    }
  }

  const visibleStores =
    activeGroupTab === 'all'
      ? stores
      : groups.some((g) => g.id === activeGroupTab)
        ? stores.filter((s) => s.groupId === activeGroupTab)
        : (() => {
            const cg = customGroups.find((c) => c.id === activeGroupTab);
            return cg ? stores.filter((s) => cg.storeIds.includes(s.id)) : stores;
          })();

  const totalAllSellIn = stores.reduce(
    (sum, s) => sum + (storeStats.get(s.id)?.ordered ?? 0),
    0
  );

  const selectedSet = new Set(selectedStoreIds);
  const singleSelectedIdx =
    selectedStoreIds.length === 1
      ? visibleStores.findIndex((s) => s.id === selectedStoreIds[0])
      : -1;

  const handleSelectGroup = (groupId: 'all' | GroupId) => {
    onChangeGroupTab(groupId);
    if (groupId === 'all') {
      onChangeSelectedStoreIds(stores.map((s) => s.id));
    } else {
      onChangeSelectedStoreIds(
        stores.filter((s) => s.groupId === groupId).map((s) => s.id)
      );
    }
  };

  const handleSelectCustomGroup = (cg: CustomStoreGroup) => {
    onChangeGroupTab(cg.id);
    onChangeSelectedStoreIds(cg.storeIds);
  };

  const handleStoreClick = (storeId: string) => {
    if (multiSelectMode) {
      if (selectedSet.has(storeId)) {
        if (selectedStoreIds.length > 1) {
          onChangeSelectedStoreIds(selectedStoreIds.filter((id) => id !== storeId));
        }
      } else {
        onChangeSelectedStoreIds([...selectedStoreIds, storeId]);
      }
      return;
    }
    onChangeSelectedStoreIds([storeId]);
  };

  const handleCycle = (delta: number) => {
    if (visibleStores.length === 0) return;
    if (singleSelectedIdx === -1) {
      onChangeSelectedStoreIds([visibleStores[delta > 0 ? 0 : visibleStores.length - 1].id]);
    } else {
      const nextIdx = (singleSelectedIdx + delta + visibleStores.length) % visibleStores.length;
      onChangeSelectedStoreIds([visibleStores[nextIdx].id]);
    }
  };

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed || selectedStoreIds.length === 0) return;
    onSaveCustomGroup(trimmed, selectedStoreIds);
    setNewGroupName('');
    setCreatingGroup(false);
  };

  const singleSelectedStore =
    selectedStoreIds.length === 1
      ? stores.find((s) => s.id === selectedStoreIds[0]) ?? null
      : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl font-semibold text-foreground">
            {dict.navTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            {stores.length} {dict.card.storesCount} · {dict.navSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => handleCycle(-1)}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {dict.prev}
          </button>

          <span className="font-mono text-xs text-muted-foreground tabular-nums px-1 whitespace-nowrap">
            {singleSelectedIdx >= 0 ? `${singleSelectedIdx + 1} / ${visibleStores.length}` : `${selectedStoreIds.length} / ${stores.length}`}
          </span>

          <button
            type="button"
            onClick={() => handleCycle(1)}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {dict.next}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMultiSelectMode((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              multiSelectMode
                ? 'border-accent bg-accent/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {dict.multiSelect}
          </button>

          <button
            type="button"
            onClick={() => handleSelectGroup('all')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedStoreIds.length === stores.length
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-muted'
            }`}
          >
            {dict.allStores} ({totalAllSellIn.toLocaleString('it-IT')} {dict.card.pcs})
          </button>
        </div>
      </div>

      {/* Group Selector Strip */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => handleSelectGroup('all')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeGroupTab === 'all' && selectedStoreIds.length === stores.length
              ? 'bg-foreground text-background'
              : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          }`}
        >
          {dict.allStores} ({stores.length})
        </button>

        {groups.map((group) => {
          const count = stores.filter((s) => s.groupId === group.id).length;
          const isGroupSelected =
            activeGroupTab === group.id ||
            (stores
              .filter((s) => s.groupId === group.id)
              .every((s) => selectedSet.has(s.id)) &&
              selectedStoreIds.length === count);

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => handleSelectGroup(group.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isGroupSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {group.name} ({count})
            </button>
          );
        })}

        {customGroups.map((cg) => {
          const isSelected =
            activeGroupTab === cg.id ||
            (cg.storeIds.every((id) => selectedSet.has(id)) &&
              selectedStoreIds.length === cg.storeIds.length);
          return (
            <div key={cg.id} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => handleSelectCustomGroup(cg)}
                className={`rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {cg.name} ({cg.storeIds.length})
              </button>
              <button
                type="button"
                onClick={() => onDeleteCustomGroup(cg.id)}
                title={dict.deleteGroup}
                className="rounded-r-md border-l border-border/50 bg-muted/60 px-1.5 py-1.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {!creatingGroup ? (
          <button
            type="button"
            onClick={() => setCreatingGroup(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {dict.saveGroup}
          </button>
        ) : (
          <form onSubmit={handleCreateGroupSubmit} className="ml-auto flex items-center gap-1.5">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={dict.customGroupPlaceholder}
              className="w-44 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground"
              autoFocus
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground cursor-pointer"
            >
              {dict.save}
            </button>
            <button
              type="button"
              onClick={() => setCreatingGroup(false)}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {dict.cancel}
            </button>
          </form>
        )}
      </div>

      {/* Store Cards Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {visibleStores.map((store, idx) => {
          const stats = storeStats.get(store.id) ?? { ordered: 0, matchedSold: 0 };
          const isSelected = selectedSet.has(store.id);
          const pct = stats.ordered > 0 ? getSellOutPct(stats.matchedSold, stats.ordered) : 0;

          return (
            <button
              key={store.id}
              type="button"
              onClick={() => handleStoreClick(store.id)}
              className={`group relative rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-accent bg-accent/10 ring-1 ring-accent'
                  : 'border-border bg-card hover:border-accent/60'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                <span className="font-mono tabular-nums truncate">
                  #{idx + 1} · {store.groupName}
                </span>
                {multiSelectMode && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </span>
                )}
              </div>

              <div className="mt-1.5 line-clamp-2 min-h-9 text-sm font-semibold leading-tight text-foreground">
                {store.shortName}
              </div>

              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{store.code}</span>
              </div>

              <div className="mt-3 flex items-end justify-between gap-1">
                <div className="font-mono text-[11px] leading-5 tabular-nums">
                  <div className="text-muted-foreground">
                    In <b className="text-foreground">{stats.ordered}</b>
                  </div>
                  <div className="text-success font-medium">
                    Out {stats.matchedSold}
                  </div>
                </div>
                <RadialGauge value={pct} size={38} />
              </div>
            </button>
          );
        })}
      </div>

      {singleSelectedStore && singleSelectedStore.unmatched > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {singleSelectedStore.code !== 'NO-ORDER'
            ? `${singleSelectedStore.unmatched} ${dict.unmatchedNote}`
            : `${dict.noOrderNote} ${singleSelectedStore.soldTotal} ${dict.card.pcs}.`}
        </p>
      )}
    </section>
  );
}
