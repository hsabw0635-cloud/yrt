import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, X } from 'lucide-react';

interface ToastItem { id: number; message: string; type: 'success' | 'error' | 'info' }
const ToastContext = createContext<{ show: (message: string, type?: ToastItem['type']) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, type }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4500);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.type}`}>
            {item.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{item.message}</span>
            <button onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label="إغلاق">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider missing');
  return context;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '', title, subtitle, style }: { children: ReactNode; className?: string; title?: string; subtitle?: string; style?: CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || subtitle) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'navy' }: {
  label: string; value: string | number; hint?: string; icon?: ReactNode; tone?: 'navy' | 'teal' | 'gold' | 'rose';
}) {
  return (
    <Card className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </Card>
  );
}

const statusMap: Record<string, { label: string; className: string }> = {
  open: { label: 'مفتوحة 🟢', className: 'success' },
  registered: { label: 'تم تسجيل حضورك ✅', className: 'success' },
  present: { label: 'حاضر ✅', className: 'success' },
  closed: { label: 'مغلقة 🔒', className: 'muted' },
  locked: { label: 'مغلقة 🔒', className: 'muted' },
  scheduled: { label: 'لم تفتح 🔒', className: 'muted' },
  expired: { label: 'انتهى التسجيل ⛔', className: 'warning' },
  absent: { label: 'غائب ⛔', className: 'danger' },
  not_marked: { label: 'لم يسجل بعد', className: 'warning' },
  active: { label: 'مفعّل', className: 'success' },
  disabled: { label: 'موقوف', className: 'danger' },
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const meta = statusMap[status] || { label: label || status, className: 'muted' };
  return <span className={`badge badge-${meta.className}`}>{label || meta.label}</span>;
}

export function Loading() {
  return <div className="loading"><LoaderCircle className="spin" size={28} /><span>جارٍ التحميل...</span></div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <Inbox size={36} />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" aria-label={`${value}%`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
