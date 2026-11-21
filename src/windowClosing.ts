import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
const checks = new Map<symbol, () => string | null>();
export function useCloseGuard(check: () => string | null) { const current = useRef(check); current.current = check; useEffect(() => { const key = Symbol(); checks.set(key, () => current.current()); return () => { checks.delete(key); }; }, []); }
// One listener only: separate SDK listeners could independently destroy the window.
export function useWindowClosing(showWarnings: (warnings: string[]) => void) { useEffect(() => { let cancelled = false, stop: (() => void) | undefined; try {
    void getCurrentWindow().onCloseRequested(event => { const warnings = [...checks.values()].map(check => check()).filter((warning): warning is string => !!warning); if (warnings.length) {
        event.preventDefault();
        showWarnings(warnings);
    } }).then(fn => { if (cancelled)
        fn();
    else
        stop = fn; }).catch(() => { });
}
catch { /* browser */ } return () => { cancelled = true; stop?.(); }; }, []); }
