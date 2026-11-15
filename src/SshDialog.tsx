import { useEffect, useRef, useState } from "react";
import { Shield, AlertTriangle, X } from "lucide-react";
import { errorText, t, type Language, type Message } from "./i18n";
import { sshApi, type HostProbe, type SshAuth } from "./services/ssh";
import { terminalApi } from "./services/terminal";
import type { Session } from "./types";

export function SshDialog({ session, language, onClose, onConnected, temporary = false }: { session: Session; temporary?: boolean; language: Language; onClose: () => void; onConnected: (id: string, details: Pick<Session, "username" | "authMethod" | "keyPath">) => void }) {
  const [probe, setProbe] = useState<HostProbe | null>(null), [approved, setApproved] = useState(false), [confirmation, setConfirmation] = useState("");
  const [stage, setStage] = useState<"host" | "auth">("host"), [busy, setBusy] = useState(true), [error, setError] = useState(""), [note, setNote] = useState("");
  const [username, setUsername] = useState(session.username), [method, setMethod] = useState<SshAuth["method"]>(session.authMethod ?? "agent"), [password, setPassword] = useState(""), [keyPath, setKeyPath] = useState(session.keyPath ?? ""), [passphrase, setPassphrase] = useState(""), [savePassword, setSavePassword] = useState(false);
  const alive = useRef(true), ticket = useRef<string | null>(null), panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const tr = (key: Message) => t(language, key);
  const check = async () => {
    setBusy(true); setError(""); setProbe(null); setStage("host"); setApproved(false); setConfirmation("");
    if (ticket.current) void sshApi.cancel(ticket.current);
    try {
      const value = await sshApi.probe(session.host, session.port);
      if (!alive.current) { await sshApi.cancel(value.ticket); return; }
      ticket.current = value.ticket; setProbe(value);
      if (value.status === "known") setStage("auth");
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; heading.current?.focus();
    void check();
    return () => { alive.current = false; if (ticket.current) void sshApi.cancel(ticket.current); previous?.focus(); };
  }, []);
  const connect = async () => {
    if (!probe || busy) return;
    setBusy(true); setError("");
    const auth: SshAuth = { username, method, password, keyPath, passphrase, savePassword: !temporary && method === "password" && savePassword };
    // Clear visible secret fields before crossing IPC. No React state, session
    // metadata or browser storage retains them after the submitted request.
    setPassword(""); setPassphrase("");
    const request = sshApi.open(probe.ticket, probe.status === "known" ? "known" : probe.status === "unknown" ? "trust" : "replace", confirmation, auth);
    try {
      const id = await request; ticket.current = null;
      if (!alive.current) { await terminalApi.close(id); return; }
      onConnected(id, { username, authMethod: !temporary && method === "password" && savePassword ? "stored" : method, keyPath: method === "key" ? keyPath : undefined });
    } catch (e) { if (alive.current) { setError(String(e)); setProbe(null); ticket.current = null; } }
    finally { auth.password = ""; auth.passphrase = ""; if (alive.current) setBusy(false); }
  };
  return <div className="preferences-backdrop" onKeyDown={e => {
    if (e.key === "Escape") onClose();
    if (e.key !== "Tab") return;
    const controls = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }}><div className="preferences-panel ssh-dialog" ref={panel} role="dialog" aria-modal="true" aria-labelledby="ssh-title">
    <div className="preferences-brand"><Shield size={22}/><span>{tr("sshTitle")}</span><button className="icon-button" aria-label={tr("closeConnection")} onClick={onClose}><X size={18}/></button></div>
    <div className="preferences-content"><h1 id="ssh-title" ref={heading} tabIndex={-1}>{session.name}</h1><p className="preferences-intro">{session.username ? `${session.username}@` : ""}{session.host}:{session.port}</p>
      {!probe && busy && <p role="status">{tr("checkingHost")}</p>}
      {probe && stage === "host" && <><div className={probe.status === "changed" ? "host-warning changed" : "host-warning"}>{probe.status === "changed" && <AlertTriangle size={21}/>}<p>{tr(probe.status === "changed" ? "hostChanged" : "hostUnknown")}</p></div><dl className="host-fingerprint"><dt>{tr("fingerprint")} · {probe.algorithm}</dt><dd>{probe.fingerprint}</dd>{probe.previousFingerprint && <><dt>{tr("previousFingerprint")}</dt><dd>{probe.previousFingerprint}</dd></>}</dl>
        <label className="check-field"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/><span>{tr("trustHost")}</span></label>
        {probe.status === "changed" && <label className="field"><span>{tr("confirmHost")}: <strong>{probe.host}</strong></span><input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label>}
      </>}
      {probe && stage === "auth" && <><p className="verified-host"><Shield size={15}/>{tr(probe.status === "known" ? "hostKnown" : "verifyHost")} <code>{probe.fingerprint}</code></p>
        <label className="field"><span>{tr("username")}</span><input disabled={busy} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"/></label>
        <label className="field"><span>{tr("authentication")}</span><select aria-label={tr("authentication")} disabled={busy} value={method} onChange={e => { setMethod(e.target.value as SshAuth["method"]); setPassword(""); setPassphrase(""); setSavePassword(false); }}>{(["agent", "password", "stored", "key"] as const).map(value => <option key={value} value={value}>{tr(value === "stored" ? "savedPassword" : value === "key" ? "keyFile" : value)}</option>)}</select></label>
        {method === "password" && <><label className="field"><span>{tr("password")}</span><input disabled={busy} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" maxLength={4096}/></label>{!temporary && <><label className="check-field"><input disabled={busy} type="checkbox" checked={savePassword} onChange={e => setSavePassword(e.target.checked)}/><span>{tr("rememberPassword")}</span></label><p className="preferences-note">{tr("vaultNote")}</p></>}</>}
        {method === "key" && <><label className="field"><span>{tr("keyPath")}</span><input disabled={busy} value={keyPath} onChange={e => setKeyPath(e.target.value)} placeholder="C:\\Users\\you\\.ssh\\id_ed25519"/></label><label className="field"><span>{tr("passphrase")}</span><input disabled={busy} type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="off" maxLength={4096}/></label></>}
        {method === "agent" && <p className="preferences-note">{tr("agentNote")}</p>}
        {method === "stored" && <button className="text-button" disabled={busy || !username} onClick={() => { void sshApi.forget(session.host, session.port, username).then(() => { setNote("passwordForgotten"); setMethod("password"); }).catch(e => setError(String(e))); }}>{tr("forgetPassword")}</button>}
      </>}
      {note && <p role="status">{tr(note as Message)}</p>}{error && <div className="preferences-error" role="alert">{errorText(error, language)}</div>}
    </div><footer className="preferences-footer"><span>SSH · {tr("localSaved")}</span><div className="preferences-actions"><button className="btn secondary" onClick={onClose}>{tr("cancel")}</button>
      {!probe && !busy && <button className="btn primary" onClick={() => void check()}>{tr("retry")}</button>}
      {probe && stage === "host" && <button className={`btn ${probe.status === "changed" ? "danger" : "primary"}`} disabled={!approved || (probe.status === "changed" && confirmation !== probe.host)} onClick={() => setStage("auth")}>{tr(probe.status === "changed" ? "replaceHost" : "trustContinue")}</button>}
      {probe && stage === "auth" && <button className="btn primary" disabled={busy || !username || (method === "password" && !password) || (method === "key" && !keyPath)} onClick={() => void connect()}>{tr(busy ? "connecting" : "connect")}</button>}
    </div></footer>
  </div></div>;
}
