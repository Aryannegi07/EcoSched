import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

const ToastCtx = createContext(null);
const ConfirmCtx = createContext(null);

/** Toasts ("Request #4 cancelled") and a confirm dialog that replaces window.confirm. */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, text) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, type, text }]);
    setTimeout(() => dismiss(id), type === 'error' ? 8000 : 5000);
  }, [dismiss]);
  const toast = useMemo(() => ({ success: (t) => push('success', t), error: (t) => push('error', t) }), [push]);

  const [dialog, setDialog] = useState(null);
  const ref = useRef(null);
  const confirm = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  useEffect(() => {
    const d = ref.current;
    if (dialog && d && !d.open) {
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    }
  }, [dialog]);
  const close = (result) => {
    const d = ref.current;
    if (d?.close) d.close();
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon name={t.type === 'error' ? 'alert' : 'check'} />
              <span>{t.text}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss"><Icon name="x" /></button>
            </div>
          ))}
        </div>
        {dialog && (
          <dialog ref={ref} className="confirm" onCancel={(e) => { e.preventDefault(); close(false); }} aria-labelledby="confirm-title">
            <h3 id="confirm-title">{dialog.title}</h3>
            <p>{dialog.body}</p>
            <div className="btn-row">
              <button className="btn quiet" onClick={() => close(false)} autoFocus>{dialog.cancelLabel || 'Keep it'}</button>
              <button className={`btn danger solid`} onClick={() => close(true)}>{dialog.confirmLabel || 'Confirm'}</button>
            </div>
          </dialog>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);
