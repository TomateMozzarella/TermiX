import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export function Modal({ title, closeLabel, onClose, onBackdrop, headerActions, busy, children, footer, className = "" }: { title: string; closeLabel: string; onClose: () => void; onBackdrop?: () => void; headerActions?: ReactNode; busy?: boolean; children: ReactNode; footer?: ReactNode; className?: string }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { const owner = panel.current?.ownerDocument ?? document; const previous = owner.activeElement as HTMLElement | null; heading.current?.focus(); return () => { owner.defaultView?.requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); }; }, []);
  return <div className="preferences-backdrop" onClick={event => { if (!busy && event.target === event.currentTarget) onBackdrop?.(); }} onKeyDown={e => {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key !== "Tab") return;
    const fields = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary:first-child');
    if (!fields?.length) return; const first = fields[0], last = fields[fields.length - 1];
    const active = panel.current?.ownerDocument.activeElement;
    if (e.shiftKey && (active === first || active === heading.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }}><div ref={panel} className={`preferences-panel manager-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <header className="manager-header"><h1 ref={heading} tabIndex={-1} id={titleId}>{title}</h1><div className="manager-header-actions">{headerActions}<button className="icon-button" disabled={busy} aria-label={closeLabel} onClick={onClose}><X size={20}/></button></div></header>
    <div className="preferences-content manager-content">{children}</div>{footer != null && <footer className="preferences-footer manager-footer">{footer}</footer>}
  </div></div>;
}

export function useConfirmation(language: "de" | "en") {
  const [request, setRequest] = useState<{message: string; owner: Document; resolve: (accepted: boolean) => void} | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const de = language === "de";
  function confirm(message: string, owner = document) {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      pending.current = resolve;
      setRequest({message, owner, resolve});
    });
  }
  function finish(accepted: boolean) {
    pending.current?.(accepted);
    pending.current = null;
    setRequest(null);
  }
  const dialog = request && createPortal(
    <Modal title={de ? "Änderungen bestätigen" : "Confirm changes"} closeLabel={de ? "Abbrechen" : "Cancel"}
      className="confirmation-dialog" onClose={() => finish(false)} footer={<>
        <button className="btn secondary" onClick={() => finish(false)}>{de ? "Abbrechen" : "Cancel"}</button>
        <button className="btn primary" onClick={() => finish(true)}>{de ? "Bestätigen" : "Confirm"}</button>
      </>}><p>{request.message}</p></Modal>, request.owner.body);
  return {confirm, dialog, dismiss: () => finish(false)};
}

