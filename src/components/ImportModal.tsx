import { useEffect, useState } from 'react';
import { FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react';
import type { Lang, StoreRecord } from '../types/retail';
import {
  parseJoorOrdersXlsx,
  parseSellOutFile,
  type ParsedJoorOrderRow,
  type ParsedSellOutLine,
} from '../utils/analytics';
import { t } from '../utils/i18n';

interface ImportModalProps {
  isOpen: boolean;
  stores: StoreRecord[];
  defaultStoreId: string;
  lang: Lang;
  onClose: () => void;
  onApplySellOut: (
    storeId: string,
    lines: ParsedSellOutLine[]
  ) => { matchedUnits: number; unmatchedUnits: number; totalUnits: number; matchedSkus: number };
  onApplyOrders: (storeId: string, rows: ParsedJoorOrderRow[]) => number;
  onResetDatabase: () => void;
}

export function ImportModal({
  isOpen,
  stores,
  defaultStoreId,
  lang,
  onClose,
  onApplySellOut,
  onApplyOrders,
  onResetDatabase,
}: ImportModalProps) {
  const dict = t(lang);
  const [targetStoreId, setTargetStoreId] = useState(defaultStoreId || stores[0]?.id || '');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (defaultStoreId) setTargetStoreId(defaultStoreId);
  }, [defaultStoreId]);

  if (!isOpen) return null;

  const handleSellOutChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSellOutFile(file);
      if (parsed.length === 0) {
        setFeedback({ type: 'err', msg: dict.importModal.error });
        return;
      }
      const res = onApplySellOut(targetStoreId, parsed);
      setFeedback({
        type: 'ok',
        msg: `${dict.importModal.success} ${res.totalUnits} ${dict.card.pcs} (${res.matchedUnits} abbinati su ${res.matchedSkus} SKU${
          res.unmatchedUnits > 0 ? `, ${res.unmatchedUnits} extra` : ''
        })`,
      });
    } catch {
      setFeedback({ type: 'err', msg: dict.importModal.error });
    }
  };

  const handleOrdersChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseJoorOrdersXlsx(file);
      if (rows.length === 0) {
        setFeedback({ type: 'err', msg: dict.importModal.error });
        return;
      }
      const totalOrdered = onApplyOrders(targetStoreId, rows);
      setFeedback({
        type: 'ok',
        msg: `${dict.importModal.success} ${totalOrdered} ${dict.card.pcs} (${rows.length} righe PO)`,
      });
    } catch {
      setFeedback({ type: 'err', msg: dict.importModal.error });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              {dict.importModal.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {dict.importModal.desc}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.modal.close}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-xs font-medium text-foreground">
            {dict.importModal.targetStore}
            <select
              value={targetStoreId}
              onChange={(e) => setTargetStoreId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.groupName} — {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-5 text-center hover:border-accent cursor-pointer transition-colors">
            <Upload className="h-6 w-6 text-primary" />
            <span className="mt-2 text-sm font-medium text-foreground">
              {dict.importModal.fileLabel}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleSellOutChange}
              className="hidden"
            />
          </label>

          <label className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-medium text-foreground hover:border-accent cursor-pointer transition-colors">
            <FileSpreadsheet className="h-4 w-4 text-accent" />
            <span>{dict.importModal.ordersFileLabel}</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleOrdersChange}
              className="hidden"
            />
          </label>

          {feedback && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs tabular-nums ${
                feedback.type === 'ok'
                  ? 'border-success/40 bg-success/10 text-foreground'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{dict.importModal.applyNote}</p>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => {
              onResetDatabase();
              setFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {dict.resetData}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground cursor-pointer"
          >
            {dict.modal.close}
          </button>
        </div>
      </div>
    </div>
  );
}
