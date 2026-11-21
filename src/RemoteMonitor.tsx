import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Language } from './i18n';
type Sample = {
    cpuTotal: number | null;
    cpuIdle: number | null;
    cpuBusyBasisPoints?: number | null;
    memoryTotal: number;
    memoryUsed: number;
    diskTotal: number;
    diskUsed: number;
    uptime: number;
    received: number | null;
    sent: number | null;
    sshSessions: number | null;
    users: number | null;
    windows?: boolean;
};
const size = (v: number) => v >= 1073741824 ? `${(v / 1073741824).toFixed(1)} GB` : `${(v / 1048576).toFixed(1)} MB`;
export function RemoteMonitor({ id, language }: {
    id: string;
    language: Language;
}) {
    const [attempt, setAttempt] = useState(0);
    const [enabled, setEnabled] = useState(true), [sample, setSample] = useState<Sample | null>(null), [cpu, setCpu] = useState<number | null>(null), [rates, setRates] = useState<[
        number,
        number
    ] | null>(null), [error, setError] = useState(false);
    const previous = useRef<{
        value: Sample;
        time: number;
    } | null>(null);
    useEffect(() => {
        setSample(null);
        setCpu(null);
        setRates(null);
        previous.current = null;
        setError(false);
        if (!enabled)
            return;
        let alive = true, timer: ReturnType<typeof setTimeout>;
        const poll = async () => { try {
            if (!document.hidden) {
                const value = await invoke<Sample>('ssh_monitor', { id });
                if (!alive)
                    return;
                const time = performance.now(), old = previous.current;
                if (value.cpuBusyBasisPoints != null) {
                    setCpu(value.cpuBusyBasisPoints / 100);
                } else if (old && value.cpuTotal != null && old.value.cpuTotal != null && value.cpuIdle != null && old.value.cpuIdle != null && value.cpuTotal > old.value.cpuTotal) {
                    setCpu(Math.max(0, Math.min(100, 100 * (1 - (value.cpuIdle - old.value.cpuIdle) / (value.cpuTotal - old.value.cpuTotal)))));
                }
                if (old) {
                    const seconds = (time - old.time) / 1000;
                    if (seconds > 0 && value.received != null && value.sent != null && old.value.received != null && old.value.sent != null && value.received >= old.value.received && value.sent >= old.value.sent) {
                        setRates([(value.received - old.value.received) / seconds, (value.sent - old.value.sent) / seconds]);
                    } else setRates(null);
                }
                previous.current = { value, time };
                setSample(value);
                setError(false);
            }
        }
        catch (e) {
            if (alive) {
                setError(true);
                setSample(null);
                previous.current = null;
                setCpu(null);
                setRates(null);
            }
            if (String(e) !== "monitor_busy")
                return;
        } if (alive)
            timer = setTimeout(poll, 5000); };
        void poll();
        return () => { alive = false; clearTimeout(timer); };
    }, [id, enabled, attempt]);
    return <aside className="remote-monitor" aria-label={language === 'de' ? 'Remote-Monitoring' : 'Remote monitoring'}><button aria-pressed={enabled} onClick={() => setEnabled(v => !v)}>{language === 'de' ? 'Monitoring' : 'Monitoring'} {enabled ? '●' : '○'}</button>{enabled && (error ? <span role="status">{language === 'de' ? 'Keine aktuellen Remote-Messwerte verfügbar' : 'Current remote metrics unavailable'} <button onClick={() => setAttempt(v => v + 1)}>{language === 'de' ? 'Erneut versuchen' : 'Retry'}</button></span> : sample ? <>{(sample.cpuTotal != null || sample.cpuBusyBasisPoints != null) && <span>CPU <b>{cpu === null ? '…' : `${cpu.toFixed(0)}%`}</b></span>}<span>RAM <b>{size(sample.memoryUsed)} / {size(sample.memoryTotal)}</b></span><span title={sample.windows ? (language === "de" ? "Systemlaufwerk" : "System drive") : (language === "de" ? "Dateisystem /" : "Filesystem /")}>{sample.windows ? (language === "de" ? "Systemlaufwerk" : "System drive") : "/"} <b>{(sample.diskUsed / sample.diskTotal * 100).toFixed(0)}%</b></span>{sample.received != null && sample.sent != null && <span>↓ {rates ? size(rates[0]) : '…'}/s · ↑ {rates ? size(rates[1]) : '…'}/s</span>}<span>{Math.floor(sample.uptime / 86400)}d {Math.floor(sample.uptime % 86400 / 3600)}h</span>{sample.sshSessions != null && <span title={language === 'de' ? 'Sichtbare sshd-Sitzungen; ohne Multiplex-Kanäle' : 'Visible sshd sessions; excludes multiplexed channels'}>SSH <b>{sample.sshSessions}</b></span>}{sample.users != null && <span title="who">{language === 'de' ? 'Angemeldet' : 'Logged in'} <b>{sample.users}</b></span>}</> : <span role="status">{language === 'de' ? 'Messwerte werden geladen…' : 'Loading metrics…'}</span>)}</aside>;
}
