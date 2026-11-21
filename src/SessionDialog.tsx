import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { normalizeAddress } from "./address";
import { errorText, t, type Language } from "./i18n";
import type { Session, SessionFolder, SessionKind } from "./types";
import type { ShellProfile } from "./services/terminal";

export function SessionDialog({ initial, editing, folders, profiles, language, onSave, onClose }: { initial: Session; editing: boolean; folders: SessionFolder[]; profiles: ShellProfile[]; language: Language; onSave: (value: Session) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(initial), [port, setPort] = useState(String(initial.port)), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const edit = (value: Partial<Session>) => setDraft(old => ({ ...old, ...value }));
  const network = draft.kind === "ssh" || draft.kind === "rdp";
  const endpoint = useMemo(() => { if (!network || !draft.host.trim()) return null; try { return normalizeAddress(draft.host, Number(port)); } catch (error) { return { error }; } }, [draft.host, draft.kind, port]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      const normalized = network ? normalizeAddress(draft.host, Number(port)) : { host: "", port: 22 };
      if (draft.kind === "ssh" && !draft.username.trim()) throw "invalid_username";
      await onSave({ ...draft, ...normalized, name: draft.name.trim() || normalized.host || tr("localTerminal"), username: draft.kind === "rdp" ? "" : draft.username.trim(), authMethod: draft.kind === "rdp" ? undefined : draft.authMethod, keyPath: draft.kind === "rdp" ? undefined : draft.keyPath });
    } catch (e) { setError(String(e)); setBusy(false); }
  };
  return <Modal title={tr(editing ? "editSession" : "newConnection")} closeLabel={tr("closeDialog")} onClose={onClose} busy={busy} footer={<div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>{tr("cancel")}</button><button className="btn primary" disabled={busy} onClick={() => void save()}>{tr(busy ? "saving" : "saveSession")}</button></div>}>
    <p className="preferences-intro">{tr(editing ? "sessionEditNote" : "connectionIntro")}</p>
    <div className="form-row"><label className="field grow"><span>{tr("connectionType")}</span><select aria-label={tr("connectionType")} disabled={busy} value={draft.kind} onChange={e => { const kind = e.target.value as SessionKind; edit({kind}); setPort(kind === "rdp" ? "3389" : "22"); }}><option value="ssh">SSH</option><option value="rdp">RDP</option><option value="local">{tr("localTerminal")}</option>{!["ssh", "local", "rdp"].includes(draft.kind) && <option value={draft.kind}>{draft.kind.toUpperCase()} · {tr("planned")}</option>}</select></label><label className="field grow"><span>{tr("folder")}</span><select aria-label={tr("folder")} disabled={busy} value={draft.group} onChange={e => edit({ group: e.target.value })}><option value="">{tr("unassigned")}</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
    <label className="field"><span>{tr("displayName")}</span><input disabled={busy} value={draft.name} maxLength={120} onChange={e => edit({ name: e.target.value })} placeholder="Proxmox"/></label>
    {network && <><div className="form-row"><label className="field grow"><span>{tr("hostname")}</span><input disabled={busy} value={draft.host} onChange={e => edit({ host: e.target.value })} onBlur={() => { if (endpoint && !("error" in endpoint)) { edit({ host: endpoint.host }); setPort(String(endpoint.port)); } }} placeholder="server.example" autoComplete="off"/></label><label className="field port"><span>{tr("port")}</span><input disabled={busy} value={port} onChange={e => setPort(e.target.value)} inputMode="numeric"/></label></div>
      <p className="address-preview">{endpoint && !("error" in endpoint) ? <>{draft.kind === "rdp" ? "RDP" : tr("addressPreview")}: <strong>{endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host}:{endpoint.port}</strong></> : draft.kind === "rdp" ? (language === "de" ? "Öffnet die gespeicherte Verbindung im Windows-Remotedesktop." : "Opens the saved connection in Windows Remote Desktop.") : tr("addressNote")}</p>
      {endpoint && "error" in endpoint && <p className="preferences-note">{errorText(endpoint.error, language)}</p>}
    </>}
    {draft.kind === "ssh" && <>
      <label className="field"><span>{tr("username")}</span><input disabled={busy} value={draft.username} onChange={e => edit({ username: e.target.value })} autoComplete="username" maxLength={256}/></label>
      <label className="field"><span>{tr("authentication")}</span><select aria-label={tr("authentication")} disabled={busy} value={draft.authMethod ?? "agent"} onChange={e => edit({ authMethod: e.target.value as Session["authMethod"] })}><option value="agent">{tr("agent")}</option><option value="password">{tr("password")}</option><option value="key">{tr("keyFile")}</option><option value="stored">{tr("savedPassword")}</option></select></label>
      {draft.authMethod === "key" && <label className="field"><span>{tr("keyPath")}</span><input disabled={busy} value={draft.keyPath ?? ""} onChange={e => edit({ keyPath: e.target.value })}/></label>}{draft.authMethod === "stored" && <p className="preferences-note">{tr("credentialReference")}</p>}
    </>}
    {draft.kind !== "rdp" && <section className="session-defaults"><h2>{tr("connectionDefaults")}</h2><div className="form-row">{draft.kind === "local" && <label className="field grow"><span>{tr("shell")}</span><select aria-label={tr("shell")} disabled={busy} value={draft.shellProfile ?? ""} onChange={e => edit({ shellProfile: e.target.value || undefined })}><option value="">{tr("useDefault")}</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label className="field grow"><span>{tr("font")}</span><select aria-label={tr("font")} disabled={busy} value={draft.fontSize ?? ""} onChange={e => edit({ fontSize: e.target.value ? Number(e.target.value) : undefined })}><option value="">{tr("useDefault")}</option>{Array.from({ length: 12 }, (_, i) => i + 11).map(n => <option key={n} value={n}>{n} px</option>)}</select></label></div></section>}
    <p className="preferences-note">{tr("metadataOnly")}</p>{error && <div className="preferences-error" role="alert">{errorText(error, language)}</div>}
  </Modal>;
}
