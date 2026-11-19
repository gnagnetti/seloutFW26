export type Lang = 'it' | 'ru';

export type GroupId = 'bosco' | 'irina' | 'smykov' | 'pioneer' | 'astana';

export interface GroupRecord {
  id: GroupId;
  name: string;
  region: string;
  period: string;
}

export interface StoreRecord {
  id: string;
  groupId: GroupId;
  groupName: string;
  name: string;
  shortName: string;
  code: string;
  city: string;
  unmatched: number;
  soldTotal: number;
}

export interface ProductItem {
  storeId: string;
  storeName: string;
  groupId: GroupId;
  groupName: string;
  name: string;
  num: string;
  color: string;
  cc: string;
  cat: string;
  line: string;
  img: string | null;
  whs: number;
  rtl: number;
  po: string;
  fab: string;
  sizes: Record<string, [number, number]>;
}

export interface StoreBreakdownRow {
  storeId: string;
  storeName: string;
  shortName: string;
  groupName: string;
  ordered: number;
  sold: number;
  revenue: number;
  pct: number;
}

export interface ColorBreakdownRow {
  color: string;
  cc: string;
  img: string | null;
  ordered: number;
  sold: number;
  revenue: number;
  pct: number;
}

export interface AggregatedProductItem extends ProductItem {
  storeCount: number;
  storeBreakdown: StoreBreakdownRow[];
  colorBreakdown?: ColorBreakdownRow[];
  searchMeta?: string;
  realizedRevenue?: number;
  potentialRevenue?: number;
  wholesaleValue?: number;
}

export interface UnifiedDatabase {
  season: string;
  brand: string;
  groups: GroupRecord[];
  stores: StoreRecord[];
  items: ProductItem[];
}

export interface CustomStoreGroup {
  id: string;
  name: string;
  storeIds: string[];
}

export type ViewMode = 'gallery' | 'table' | 'cats' | 'sizes' | 'stores';

export type PerformanceTier = 'all' | 'lead' | 'mid' | 'slow' | 'out';

export type SortOption = 'sold' | 'pct' | 'units' | 'rtl' | 'whs' | 'name';

export interface FilterState {
  search: string;
  line: string;
  category: string;
  tier: PerformanceTier;
  po: string;
  sortBy: SortOption;
  aggregateModels: boolean;
}
