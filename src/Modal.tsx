import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({ title, closeLabel, onClose, busy, children, footer, className = "" }: { title: string; closeLabel: string; onClose: () => void; busy?: boolean; children: ReactNode; footer?: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { const previous = document.activeElement as HTMLElement | null; heading.current?.focus(); return () => { requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); }; }, []);
  return <div className="preferences-backdrop" onKeyDown={e => {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key !== "Tab") return;
    const fields = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary:first-child');
    if (!fields?.length) return; const first = fields[0], last = fields[fields.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }}><div ref={panel} className={`preferences-panel manager-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="manager-title">
    <header className="manager-header"><h1 ref={heading} tabIndex={-1} id="manager-title">{title}</h1><button className="icon-button" disabled={busy} aria-label={closeLabel} onClick={onClose}><X size={20}/></button></header>
    <div className="preferences-content manager-content">{children}</div>{footer != null && <footer className="preferences-footer manager-footer">{footer}</footer>}
  </div></div>;
}

