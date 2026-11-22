import { TerminalWindow } from "./TerminalWindow";
import { defaultShortcuts, readShortcuts, shortcutsStorageKey, workspaceShortcut, type ShortcutAction, type Shortcuts } from "./shortcuts";
import { readMobaSessions } from "./mobaImport";
import { readPuttySessions } from "./puttyImport";
import { readOpenSshSessions } from "./openSshImport";
import { useCallback, lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { TerminalWriter } from "./TerminalPane";
import { useWindowClosing } from "./windowClosing";
import {version} from "../package.json";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, BookOpen, ChevronLeft, ChevronRight, Columns2, Download, ExternalLink, FileText, Globe, GitFork, HardDrive, HelpCircle, MoreHorizontal, Network, Plus, Settings, Terminal, X, Pencil, Copy, Pin, ArrowLeft, ArrowRight, Maximize, RotateCw } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { Modal, useConfirmation } from "./Modal";
import { PreferencesDialog } from "./PreferencesDialog";
import { SessionDialog } from "./SessionDialog";
import { SessionSidebar, type SessionView } from "./SessionSidebar";
import { BatchSessionDialog, ConfirmDialog, FolderDialog, ImportDialog } from "./LibraryDialogs";
import { defaults, getPreferences, savePreferences, type Preferences } from "./services/preferences";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { deleteFolder, deleteSession, exportSessions, getCatalog, importSessions, pickSessionImport, reloadCatalog, saveFolder, saveSession, touchSession } from "./services/sessions";
import { resolvedTheme, accentForeground, accentText } from "./appearance";
import { errorText, t, type Message } from "./i18n";
import type { Session, SessionCatalog, SessionFolder, TerminalTab } from "./types";

type Workspace = {schemaVersion: 1; tabs: {sessionId: string | null; profile: string | null; pinned: boolean; color: string | null}[]; active: number; sidebarWidth: number; filesWidth: number; verticalSplit: boolean; splitLayout?: {tabs: number[]; column: number; columnSecond?: number; row: number}};
const makeId = () => crypto.randomUUID();
const TunnelDialog=lazy(()=>import("./TunnelDialog").then(m=>({default:m.TunnelDialog})));
const RemoteMonitor=lazy(()=>import("./RemoteMonitor").then(m=>({default:m.RemoteMonitor})));
const TerminalPane = lazy(() => import("./TerminalPane").then(module => ({ default: module.TerminalPane })));
const ExternalEditManager = lazy(() => import("./ExternalEditManager").then(module => ({ default: module.ExternalEditManager })));
const CommandsPane = lazy(() => import("./CommandsPane").then(module => ({ default: module.CommandsPane })));
const OutputEditor = lazy(() => import("./EditorDialog").then(module => ({ default: module.OutputEditor })));
const EditorDialog = lazy(() => import("./EditorDialog").then(module => ({ default: module.EditorDialog })));
const SftpPane = lazy(() => import("./SftpPane").then(module => ({ default: module.SftpPane })));
const SshDialog = lazy(() => import("./SshDialog").then(module => ({ default: module.SshDialog })));
const emptyCatalog: SessionCatalog = { schemaVersion: 2, revision: 0, folders: [], sessions: [] };
export default function App() {
  const [closeWarnings, setCloseWarnings] = useState<string[]>([]);
  useWindowClosing(setCloseWarnings);
  const [profiles, setProfiles] = useState<ShellProfile[]>([]), [preferences, setPreferences] = useState<Preferences | null>(null), [preview, setPreview] = useState<Preferences | null>(null);
  const [preferencesMode, setPreferencesMode] = useState<"setup" | "settings" | null>(null), [startupError, setStartupError] = useState(""), [retry, setRetry] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [catalog, setCatalog] = useState(emptyCatalog), [view, setView] = useState<SessionView>("all"), [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<TerminalTab[]>([]), [activeTab, setActiveTab] = useState("");
  const [tunnelId,setTunnelId]=useState<string|null>(null);
  const [commandsOpen,setCommandsOpen]=useState(false),[externalRequest,setExternalRequest]=useState<{id:string;path:string;nonce:string}|null>(null);
  const [commandsVisited, setCommandsVisited] = useState(false);
  const macroVisible = useRef(commandsOpen); macroVisible.current = commandsOpen;
  const macroInput = useRef<((id: string, text: string) => void) | null>(null);
  const captureMacroInput = useCallback((listener: typeof macroInput.current) => { macroInput.current = listener; }, []);
  const [editorRequests, setEditorRequests] = useState<Record<string, {path: string; nonce: string}>>({});
  const [remoteEditor, setVisibleEditor] = useState<string | null>(null);
  const [lastEditor, setLastEditor] = useState<string | null>(null);
  function setRemoteEditor(file: {id: string; path: string}) {
    setEditorRequests(old => ({...old, [file.id]: {path: file.path, nonce: makeId()}}));
    setLastEditor(file.id);
    setVisibleEditor(file.id);
  }
  const [filesOpen, setFilesOpen] = useState(false), [filesWidth, setFilesWidth] = useState(390);
  const activeTerminal = tabs.find(tab => tab.id === activeTab);
  const activeTerminalRef=useRef(activeTerminal);activeTerminalRef.current=activeTerminal;
  const [sidebarWidth, setSidebarWidth] = useState(310);
  const [previousWorkspace, setPreviousWorkspace] = useState<Workspace | null>(null), [workspaceReady, setWorkspaceReady] = useState(false);
  useEffect(() => { let alive = true; void invoke<Workspace | null>("get_workspace").then(value => { if (alive) setPreviousWorkspace(value); }).catch(() => {}).finally(() => { if (alive) setWorkspaceReady(true); }); return () => { alive = false; }; }, []);
  const inputs = useRef(new Map<string, TerminalWriter>());
  const [readyTabs, setReadyTabs] = useState<string[]>([]);
  const activeTransport = readyTabs.includes(activeTab) ? activeTerminal?.transportId : undefined;
  const tunnelTarget=tabs.find(tab=>tab.transportId===tunnelId && readyTabs.includes(tab.id));
  useEffect(() => { if (tunnelId && !tunnelTarget) setTunnelId(null); }, [tunnelId, tunnelTarget]);
  const [helpError, setHelpError] = useState("");
  const [help, setHelp] = useState(false), [layout, setLayout] = useState(false);
  const [multi, setMulti] = useState(false), [multiCommand, setMultiCommand] = useState("");
  const [review, setReview] = useState<{ command: string; targets: { tab: TerminalTab; write: TerminalWriter }[] } | null>(null);
  const [multiBusy, setMultiBusy] = useState(false), [multiResult, setMultiResult] = useState("");
  function markInput(id: string, write: TerminalWriter | null) {
    if (write) inputs.current.set(id, write);
    else inputs.current.delete(id);
    setReadyTabs(old => write ? (old.includes(id) ? old : [...old, id]) : old.filter(value => value !== id));
  }
  const [palette, setPalette] = useState(false), [commandQuery, setCommandQuery] = useState("");
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const [splitColumn, setSplitColumn] = useState(0);
  const [splitColumnSecond, setSplitColumnSecond] = useState(0);
  const [splitRow, setSplitRow] = useState(0);
  const [popouts, setPopouts] = useState<Record<string, Window>>({});
  const [tabMenu, setTabMenu] = useState<{x: number; y: number; id: string} | null>(null), [rename, setRename] = useState<{id: string; title: string} | null>(null), [split, setSplit] = useState<string[] | null>(null), [verticalSplit, setVerticalSplit] = useState(false), [workspaceFull, setWorkspaceFull] = useState(false);
  const [keyboardTabs, setKeyboardTabs] = useState(false);
  const [editor, setEditor] = useState<{ session: Session; editing: boolean } | null>(null), [folderEditor, setFolderEditor] = useState<SessionFolder | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "session" | "folder"; id: string; name: string } | null>(null), [incoming, setIncoming] = useState<SessionCatalog | null>(null);
  const [status, setStatus] = useState(""), [notice, setNotice] = useState<Message | null>(null), [busy, setBusy] = useState(false);
  const [pingResult, setPingResult] = useState<{host: string; address: string; roundTripMs: number | null} | null>(null);
  const [batchPicker, setBatchPicker] = useState(false);
  const batchQueue = useRef<Session[]>([]);
  const [sshImport, setSshImport] = useState<{folder?: SessionFolder; format: 'openssh' | 'putty' | 'moba'} | null>(null);
  const [sshTarget, setSshTarget] = useState<{ session: Session; replaces?: string; temporary?: boolean; showFiles?: boolean } | null>(null);
  const visible = preview ?? preferences ?? defaults("powershell"), lang = visible.language, tr = (key: Message) => t(lang, key), theme = resolvedTheme(visible.theme, systemDark);
  const shortcutHandled = useRef(false);
  const workspaceConfirmation = useConfirmation(lang);
  const configured = !!preferences?.setupComplete && preferences.setupVersion === 2;
  const [tabColour, setTabColour] = useState<{id: string; value: string} | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<{title: string; text: string} | null>(null);
  const modalOpen = !!(preferencesMode || editor || folderEditor || confirm || incoming || pingResult || batchPicker || sshImport || sshTarget || remoteEditor || rename || palette || tunnelId || help || layout || multi || tabColour || terminalOutput || closeWarnings.length);
  const updateCatalog = (value: SessionCatalog) => setCatalog(old => value.revision >= old.revision ? value : old);
  const library = <T,>(request: Promise<T>): Promise<T> => request.catch(e => { setStatus(String(e)); throw e; });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)"); const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change); return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme; document.documentElement.lang = lang;
    for (const [name, value] of Object.entries({ "--accent": visible.accent, "--accent-foreground": accentForeground(visible.accent), "--accent-ink": accentText(visible.accent, theme), "--ui-scale": String(visible.uiScale / 100) })) document.documentElement.style.setProperty(name, value);
    try { void getCurrentWindow().setTheme(visible.theme === "system" ? null : visible.theme).catch(() => {}); } catch { /* browser workflow tests */ }
  }, [theme, lang, visible.theme, visible.accent, visible.uiScale]);
  useEffect(() => { let alive = true; void getCatalog().then(value => { if (alive) updateCatalog(value); }).catch(e => { if (alive) setStatus(String(e)); }); return () => { alive = false; }; }, []);
  function localTab(value: Preferences, session?: Session): TerminalTab {
    const profile = session?.shellProfile ?? value.defaultShell;
    return { id: makeId(), title: session?.name ?? profiles.find(p => p.id === profile)?.name ?? profile, kind: "local", profile, sessionId: session?.id, fontSize: session?.fontSize, connection: session };
  }
  useEffect(() => {
    let cancelled = false; setStartupError("");
    void Promise.all([terminalApi.profiles(), getPreferences()]).then(([available, saved]) => {
      if (cancelled) return; if (!available.length) throw new Error("invalid_profile");
      setProfiles(available);
      const value = saved ? { ...defaults(available[0].id), ...saved, schemaVersion: 2 as const } : defaults(available[0].id);
      setPreferences(value);
      if (!value.setupComplete || value.setupVersion < 2) { setPreferencesMode("setup"); return; }
    }).catch(e => { if (!cancelled) setStartupError(String(e)); });
    return () => { cancelled = true; };
  }, [retry]);
  const uiShown=useRef(false);
  useEffect(()=>{if(uiShown.current||(!preferences&&!startupError))return;uiShown.current=true;queueMicrotask(()=>{void invoke("ui_ready").catch(()=>{});});},[preferences,startupError]);
  async function applyPreferences(value: Preferences, keys?: Shortcuts) {
    const saved = await savePreferences(value);
    setPreferences(saved);
    if (keys && JSON.stringify(keys) !== JSON.stringify(shortcuts)) {
      localStorage.setItem(shortcutsStorageKey, JSON.stringify(keys));
      setShortcuts(keys);
    }
    setPreview(null); setPreferencesMode(null);
  }
  const filtered = useMemo(() => {
    const folderNames = new Map(catalog.folders.map(f => [f.id, f.name]));
    return catalog.sessions.filter(s => {
      if (!query.trim() && view === "favorites" && !s.favorite) return false;
      if (!query.trim() && view === "recent" && !s.lastUsed) return false;
      if (!query.trim() && view === "unassigned" && s.group) return false;
      if (!query.trim() && view.startsWith("folder:") && s.group !== view.slice(7)) return false;
      return `${s.name} ${s.host} ${s.username} ${folderNames.get(s.group) ?? ""}`.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang));
    }).sort((a, b) => view === "recent" ? (b.lastUsed ?? 0) - (a.lastUsed ?? 0) : a.name.localeCompare(b.name, lang));
  }, [catalog, view, query, lang]);
  const presetKey = "termix.sshSessionDefaults";
  const [preset, setPreset] = useState<{port: number; fontSize?: number} | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("termix.sshSessionDefaults") ?? "null");
      if (!Number.isInteger(saved?.port) || saved.port < 1 || saved.port > 65535) return null;
      const fontSize = Number.isInteger(saved.fontSize) && saved.fontSize >= 11 && saved.fontSize <= 22 ? saved.fontSize : undefined;
      return {port: saved.port, fontSize};
    } catch { return null; }
  });
  function changePreset(session?: Session) {
    const next = session ? {port: session.port, fontSize: session.fontSize} : null;
    try {
      if (next) localStorage.setItem(presetKey, JSON.stringify(next));
      else localStorage.removeItem(presetKey);
      setPreset(next);
      setStatus("");
    } catch {
      setStatus(lang === "de" ? "Die Sitzungsvorgaben konnten nicht gespeichert werden." : "Could not save the session defaults.");
    }
  }
  function createSession(group = view.startsWith("folder:") ? view.slice(7) : "") {
    setEditor({ editing: false, session: { id: makeId(), name: "", kind: "ssh", host: "", port: preset?.port ?? 22, fontSize: preset?.fontSize, username: "", group, authMethod: "agent" } });
  }
  async function persistSession(value: Session) {
    setBusy(true);
    try {
      await library(saveSession(value)); updateCatalog(await getCatalog()); setEditor(null); setStatus("");
    } finally { setBusy(false); }
  }
  const rememberUse = (id: string) => { void touchSession(id).then(updateCatalog).catch(e => setStatus(String(e))); };
  function openSshBatch(sessions: Session[]) {
    const [first, ...queue] = sessions.filter(session => session.kind === "ssh");
    if (queue.length >= 16) {
      setStatus(lang === "de" ? "Wähle höchstens 16 SSH-Sitzungen aus." : "Select up to 16 SSH sessions.");
      return;
    }
    if (first) { batchQueue.current = queue; openSession(first); }
  }
  function openSession(session: Session) {
    setKeyboardTabs(false);
    if (session.kind === "ssh") { setSshTarget({ session }); return; }
    if (session.kind === "rdp") {
      void run(async () => { await invoke("open_rdp_session", { id: session.id }); rememberUse(session.id); });
      return;
    }
    if (session.kind !== "local" || !preferences) { setStatus(tr("unavailable")); return; }
    const tab = localTab(preferences, session); setTabs(old => [...old, tab]); setActiveTab(tab.id); rememberUse(session.id);
  }
  useEffect(() => {
    if (!configured || shortcutHandled.current) return;
    shortcutHandled.current = true;
    void invoke<Session | null>("take_launch_session").then(session => {
      if (session) openSession(session);
    }).catch(error => setStatus(String(error)));
  }, [configured]);
  function addLocalTab() { if (!preferences || !configured) return; setKeyboardTabs(false); const tab = localTab(preferences); setTabs(old => [...old, tab]); setActiveTab(tab.id); }
  function closeTab(id: string) { setTabs(old => { const next = old.filter(t => t.id !== id); if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? ""); return next; }); }
  async function run(action: () => Promise<void>) { setBusy(true); setStatus(""); setNotice(null); try { await action(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } }
  function connected(id: string, details: Pick<Session, "username" | "authMethod" | "keyPath">) {
    setKeyboardTabs(false);
    if (!sshTarget) { void terminalApi.close(id); return; }
    const snapshot = { ...sshTarget.session, ...details };
    const tab: TerminalTab = { id: makeId(), title: snapshot.name, sessionId: snapshot.id, kind: "ssh", transportId: id, temporary: sshTarget.temporary, fontSize: snapshot.fontSize, connection: snapshot };
    const replaces = sshTarget.replaces;
    const replaced = tabs.find(item => item.id === replaces);
    if (replaces && !replaced) { void terminalApi.close(id); setSshTarget(null); return; }
    if (replaced) Object.assign(tab, { id: replaced.id, title: replaced.title, pinned: replaced.pinned, color: replaced.color, fontSize: replaced.fontSize });
    const current = catalog.sessions.find(s => s.id === snapshot.id);
    if (sshTarget.temporary) rememberUse(snapshot.id);
    else if (current && current.host === snapshot.host && current.port === snapshot.port) {
      void saveSession({ ...current, ...details }).then(() => touchSession(snapshot.id)).then(updateCatalog).catch(e => setStatus(String(e)));
    }
    setTabs(old => replaces ? old.map(t => t.id === replaces ? tab : t) : [...old, tab]); setActiveTab(tab.id);
    if (sshTarget.showFiles) { setCommandsOpen(false); setFilesOpen(true); }
    const next = batchQueue.current.shift();
    setSshTarget(next ? {session: next} : null);
  }
  useEffect(() => {
    if (!workspaceReady || !configured || (!tabs.length && previousWorkspace)) return;
    const timer = setTimeout(() => { const savedTabs = tabs.filter(t => !t.temporary && (t.sessionId || t.kind === "local")).slice(0, 16); void invoke("save_workspace", {workspace: {schemaVersion: 1, tabs: savedTabs.slice(0,16).map(t => ({sessionId: t.sessionId ?? null, profile: t.sessionId ? null : t.profile ?? visible.defaultShell, pinned: !!t.pinned, color: t.color ?? null})), active: Math.max(0, savedTabs.findIndex(t => t.id === activeTab)), sidebarWidth: Math.round(sidebarWidth), filesWidth: Math.round(filesWidth), verticalSplit, splitLayout: {tabs: (split ?? []).map(id => savedTabs.findIndex(tab => tab.id === id)).filter(index => index >= 0), column: splitColumn, columnSecond: splitColumnSecond, row: splitRow}}}).catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [tabs, activeTab, sidebarWidth, filesWidth, verticalSplit, split, splitColumn, splitColumnSecond, splitRow, workspaceReady, configured, previousWorkspace, visible.defaultShell]);
  function restoreWorkspace() { if (!previousWorkspace || !preferences) return; const slots = previousWorkspace.tabs.map(saved => { const session = catalog.sessions.find(s => s.id === saved.sessionId); if (saved.sessionId && (!session || (session.kind !== "ssh" && session.kind !== "local"))) return null; const tab: TerminalTab = session?.kind === "ssh" ? {id: makeId(), title: session.name, kind: "ssh", sessionId: session.id, connection: session} : localTab({...preferences, defaultShell: saved.profile ?? preferences.defaultShell}, session); return {...tab, pinned: saved.pinned, color: saved.color ?? undefined}; }); const restored = slots.filter(tab => tab !== null); setTabs(restored); setActiveTab(slots[previousWorkspace.active]?.id ?? restored[0]?.id ?? "");
    const layout = previousWorkspace.splitLayout;
    if (layout) {
      const ids = layout.tabs.flatMap(index => slots[index]?.id ?? []);
      setSplit(ids.length >= 2 ? ids : null);
      setSplitColumn(layout.column);
      setSplitColumnSecond(layout.columnSecond ?? 0);
      setSplitRow(layout.row);
    } setSidebarWidth(Math.max(230, Math.min(window.innerWidth * .5, previousWorkspace.sidebarWidth))); setFilesWidth(Math.max(280, Math.min(window.innerWidth * .6, previousWorkspace.filesWidth))); setVerticalSplit(previousWorkspace.verticalSplit); setPreviousWorkspace(null); }
  const tabStrip = useRef<HTMLDivElement>(null);
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const strip = tabStrip.current;
    if (!strip) return;
    const update = () => {
      const left = strip.scrollLeft > 1;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setTabScroll(old => old.left === left && old.right === right ? old : { left, right });
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaX || strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      strip.scrollLeft += event.deltaY * unit;
    };
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    strip.addEventListener("scroll", update);
    strip.addEventListener("wheel", wheel, { passive: false });
    update();
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", update);
      strip.removeEventListener("wheel", wheel);
    };
  }, [tabs]);
  useEffect(() => {
    tabStrip.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);
  function scrollTabs(direction: number) {
    const strip = tabStrip.current;
    if (strip) strip.scrollBy({ left: direction * Math.max(140, strip.clientWidth * 0.7) });
  }
  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).getAttribute("role") !== "tab" || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
    setKeyboardTabs(true); setActiveTab(tabs[next].id); buttons[next].focus();
  }
  function reattachTerminal(id: string, popup: Window) {
    setPopouts(current => {
      if (current[id] !== popup) return current;
      const next = {...current};
      delete next[id];
      return next;
    });
    if (!popup.closed) popup.close();
  }

  function detachTerminal(id: string) {
    const existing = popouts[id];
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const popup = window.open("about:blank", "_blank", "popup,width=900,height=620");
    if (!popup) {
      setStatus(lang === "de" ? "Das Terminalfenster konnte nicht geöffnet werden." : "Could not open the terminal window.");
      return;
    }
    setPopouts(current => ({...current, [id]: popup}));
    setSplit(current => current?.filter(tab => tab !== id) ?? null);
    setActiveTab(id);
  }

  useEffect(() => {
    if (!Object.keys(popouts).length) return;
    const check = window.setInterval(() => {
      for (const [id, popup] of Object.entries(popouts)) {
        if (popup.closed || !tabs.some(tab => tab.id === id)) reattachTerminal(id, popup);
      }
    }, 200);
    return () => window.clearInterval(check);
  }, [popouts, tabs]);

  const menuTab = tabs.find(tab => tab.id === tabMenu?.id);
  async function closeMany(ids: string[]) { const targets = tabs.filter(t => ids.includes(t.id) && !t.pinned); if (targets.length > 1 && !await workspaceConfirmation.confirm(lang === "de" ? `${targets.length} Terminals schließen? Laufende Prozesse werden beendet.` : `Close ${targets.length} terminals? Running processes will end.`)) return; const remaining = tabs.filter(t => !targets.includes(t)); setTabs(remaining); if (!remaining.some(t => t.id === activeTab)) setActiveTab(remaining[remaining.length - 1]?.id ?? ""); setSplit(null); }
  function startSplit(id: string,count=2) { if (popouts[id]) return; const selected=[...tabs.filter(t=>t.id===id),...tabs.filter(t=>t.id!==id && !popouts[t.id])].slice(0,count);if(selected.length>1){setSplit(selected.map(t=>t.id));setActiveTab(id);} }
  const splitItems=split?.filter(id=>tabs.some(t=>t.id===id));
  const splitVisible=splitItems&&splitItems.length>1&&splitItems.includes(activeTab)?splitItems:null;
  const splitColumns=splitVisible?.length===2?(verticalSplit?1:2):(verticalSplit?2:3),splitRows=Math.ceil((splitVisible?.length??1)/splitColumns);
  const columnBoundary = Math.min(splitColumns === 3 ? 70 : 75, splitColumn || 100 / splitColumns);
  const secondBoundary = Math.min(85, Math.max(columnBoundary + 15, splitColumnSecond || (100 + columnBoundary) / 2));
  const columnEdges = splitColumns === 3 ? [0, columnBoundary, secondBoundary, 100] : splitColumns === 2 ? [0, columnBoundary, 100] : [0, 100];
  const rowBoundary = splitRow || 100 / splitRows;
  const offset = (index: number, count: number, first: number) => index === 0 ? 0 : first + (index - 1) * (100 - first) / (count - 1);
  const targets = (splitVisible ?? []).flatMap(id => {
    const tab = tabs.find(value => value.id === id);
    const write = inputs.current.get(id);
    return tab && write && readyTabs.includes(id) ? [{ tab, write }] : [];
  });
  const reviewMatches = review && review.targets.length === targets.length &&
    review.targets.every((item, index) => item.tab.id === targets[index].tab.id && item.write === targets[index].write);
  const reopenEditor = activeTransport && editorRequests[activeTransport] ? activeTransport
    : lastEditor && editorRequests[lastEditor] ? lastEditor : Object.keys(editorRequests)[0];
  useEffect(() => {
    function onShortcut(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || modalOpen || document.querySelector("[role=dialog], [role=menu]")) return;
      const binding = workspaceShortcut(event);
      if (!binding) return;
      const action = (Object.keys(shortcuts) as ShortcutAction[]).find(id => shortcuts[id] === binding);
      if (!action) return;
      const target = event.target;
      const terminal = target instanceof Element && target.closest(".terminal-host");
      const editable = target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), .monaco-editor");
      if ((terminal || editable) && !(terminal && action === "palette" && binding === defaultShortcuts.palette)) return;
      const actions: Record<ShortcutAction, (() => void) | false | null> = {
        palette: () => setPalette(true),
        newTab: configured && addLocalTab,
        connection: configured && (() => createSession()),
        split: tabs.length > 0 && (() => setLayout(true)),
        settings: preferences && (() => setPreferencesMode("settings")),
        help: () => { setHelpError(""); setHelp(true); },
      };
      const runAction = actions[action];
      if (!runAction) return;
      event.preventDefault();
      event.stopPropagation();
      runAction();
    }
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  });
  const ui = (en: string, de: string) => lang === "de" ? de : en;
  function openMulti() { setMultiCommand(""); setReview(null); setMultiResult(""); setMulti(true); }
  async function sendMulti() {
    if (!review || !reviewMatches || multiBusy || review.targets.some(({tab, write}) => inputs.current.get(tab.id) !== write)) return;
    setMultiBusy(true);
    const results = await Promise.allSettled(review.targets.map(({ write }) => write(review.command + "\r", false)));
    const failed = review.targets.filter((_, i) => {
      const result = results[i];
      return result.status !== "fulfilled" || !result.value;
    });
    setMultiResult(failed.length
      ? ui("Delivery could not be confirmed for ", "Übermittlung nicht bestätigt für ") + failed.map(({tab}) => tab.title).join(", ")
      : ui("Sent to ", "Gesendet an ") + review.targets.length + ui(" terminals", " Terminals"));
    setReview(null);
    setMultiBusy(false);
  }
  return <div className={`app-shell ${workspaceFull ? "workspace-full" : ""}`}>
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/termix.svg" alt=""/><span>Termi<span className="brand-x">X</span></span><span className="version">{version}</span></div><div className="topbar-actions">{previousWorkspace?.tabs.length ? <button className="settings-button" onClick={restoreWorkspace}>{ui("Restore workspace", "Arbeitsbereich wiederherstellen")}</button> : null}</div></header>
    <nav className="workspace-tools" aria-label={ui("Workspace tools", "Werkzeugleiste")}>
      <button className="btn primary" disabled={!configured || busy} onClick={() => createSession()}><Plus size={16}/>{ui("New connection", "Neue Verbindung")}</button>
      <button className="btn secondary" disabled={!tabs.length} onClick={() => setLayout(true)}><Columns2 size={16}/>{ui("Split view", "Ansicht teilen")}</button>
      <button className="btn secondary" disabled={targets.length < 2} onClick={openMulti}><GitFork size={16}/>Multi-Execute</button>
      <button className="btn secondary" disabled={!activeTransport || !readyTabs.includes(activeTab)} onClick={() => setTunnelId(activeTransport ?? null)}><Network size={16}/>{ui("SSH tunnels", "SSH-Tunnel")}</button>
      <div className="workspace-tools-end"><button className="btn secondary" onClick={() => reopenEditor ? setVisibleEditor(reopenEditor) : setRemoteEditor({id: "", path: ""})}><FileText size={18}/>TermiX Editor</button><button className="btn secondary" disabled={!preferences} onClick={() => setPreferencesMode("settings")} title={tr("settings")}><Settings size={18}/><span>{tr("settings")}</span></button><button className="btn secondary help-button" onClick={() => { setHelpError(""); setHelp(true); }}><HelpCircle size={16}/>{ui("Help", "Hilfe")}</button></div>
    </nav>
    <div className="workspace" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}><aside className="shared-sidebar" style={{ width: sidebarWidth }}><div className="settings-tabs workspace-sidebar-tabs"><button aria-pressed={!filesOpen && !commandsOpen} onClick={() => {setCommandsOpen(false);setFilesOpen(false);}}>{ui("Sessions", "Sitzungen")}</button><button disabled={!activeTransport} aria-pressed={filesOpen&&!commandsOpen} onClick={() => {setCommandsOpen(false);setFilesOpen(true);}}>SFTP</button><button aria-pressed={commandsOpen} onClick={()=>{setCommandsVisited(true);setCommandsOpen(true);setFilesOpen(false);}}>{ui("Commands", "Befehle")}</button></div>{(commandsVisited || commandsOpen) && <div className="commands-shell" hidden={!commandsOpen}><Suspense fallback={<span>…</span>}><CommandsPane language={lang} captureInput={captureMacroInput} targetId={`${activeTab}:${activeTransport ?? ""}`} target={activeTerminal && readyTabs.includes(activeTab)?`${activeTerminal.title} · ${activeTerminal.connection?.host?`${activeTerminal.connection.username}@${activeTerminal.connection.host}:${activeTerminal.connection.port}`:activeTerminal.profile??activeTerminal.kind}`:""} onRun={(text, focus)=>inputs.current.get(activeTab)?.(text, focus) ?? Promise.resolve(false)}/></Suspense></div>}<div className="sidebar-library" hidden={commandsOpen || (visible.sftpLayout === "shared" && filesOpen && !!activeTransport)}><SessionSidebar catalog={catalog} sessions={filtered} language={lang} view={view} setView={setView} query={query} setQuery={setQuery} configured={configured} busy={busy}
      hasSsh={!!activeTransport} onFiles={() => {setCommandsOpen(false);setFilesOpen(true);}} onMove={(session, group) => void run(async () => { await saveSession({ ...session, group }); updateCatalog(await getCatalog()); })} onNew={createSession} onOpen={openSession}
      onConnectAs={session => setSshTarget({session: {...session, username: "", authMethod: "agent", keyPath: undefined}, temporary: true})}
      onSftp={session => {
        const existing = tabs.find(tab => tab.sessionId === session.id && !tab.temporary && tab.kind === "ssh" && readyTabs.includes(tab.id));
        if (existing) { setActiveTab(existing.id); setCommandsOpen(false); setFilesOpen(true); }
        else setSshTarget({session, showFiles: true});
      }} onEdit={session => setEditor({ session, editing: true })}
      onDuplicate={session => setEditor({ editing: false, session: { ...session, id: makeId(), name: `${session.name.slice(0, 100)} (${tr("copySuffix")})`, favorite: false, lastUsed: undefined } })}
      onFavorite={session => void run(async () => { await saveSession({ ...session, favorite: !session.favorite }); updateCatalog(await getCatalog()); })}
      onDelete={session => setConfirm({ kind: "session", id: session.id, name: session.name })} onLocal={addLocalTab}
      onFolder={folder => setFolderEditor(folder ?? { id: makeId(), name: "" })} onDeleteFolder={folder => setConfirm({ kind: "folder", id: folder.id, name: folder.name })}
      hasPreset={!!preset} onSavePreset={changePreset}
      onShortcut={session => void run(async () => {
        try {
          await invoke("create_session_shortcut", {id: session.id});
          setNotice("shortcutCreated");
        } catch {
          throw ui("Could not create the desktop shortcut.", "Die Desktop-Verknüpfung konnte nicht erstellt werden.");
        }
      })}
      onPing={session => void run(async () => {
        try {
          const result = await invoke<{address: string; roundTripMs: number | null}>("ping_session", {id: session.id});
          setPingResult({host: session.host, ...result});
        } catch (error) {
          switch (String(error)) {
            case "ping_dns": throw ui("Could not resolve the hostname.", "Der Hostname konnte nicht aufgelöst werden.");
            default: throw ui("Could not run the ping.", "Der Ping konnte nicht ausgeführt werden.");
          }
        }
      })}
      onPickBatch={() => setBatchPicker(true)}
      onOpenFolder={folder => openSshBatch(catalog.sessions.filter(session => session.group === folder.id))}
      onExternalImport={(format, folder) => setSshImport({folder, format})}
      onImport={folder => void run(async () => {
        const value = await pickSessionImport();
        if (value) setIncoming(folder ? {...value, folders: [folder], sessions: value.sessions.map(session => ({...session, group: folder.id}))} : value);
      })}
      onExport={scope => void run(async () => { if (await exportSessions(scope)) setNotice("exportDone"); })}/></div>{visible.sftpLayout === "shared" && filesOpen && activeTransport && <Suspense fallback={<span>SFTP…</span>}><SftpPane key={activeTransport} id={activeTransport} language={lang} initialPath={visible.sftpStart} theme={theme} onEdit={path => visible.editorOpenMode==="external"?setExternalRequest({id:activeTransport,path,nonce:makeId()}):setRemoteEditor({id:activeTransport,path})} onClose={() => setFilesOpen(false)}/></Suspense>}</aside>
      <div className="pane-resizer" role="separator" aria-label={lang === "de" ? "Seitenleiste vergrößern" : "Resize sidebar"} aria-orientation="vertical" aria-valuenow={sidebarWidth} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setSidebarWidth(w => Math.max(230, Math.min(window.innerWidth * .5, w + (e.key === "ArrowRight" ? 20 : -20)))); } }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setSidebarWidth(Math.max(230, Math.min(window.innerWidth * .5, e.clientX))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}/>
      <main className="main"><div className="tabbar"><div ref={tabStrip} className="tab-strip" role="tablist" aria-label="TermiX" onKeyDown={onTabsKeyDown}>{tabs.map(tab => <div key={tab.id} style={{ "--tab-colour": tab.color } as React.CSSProperties} onContextMenu={e => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, id: tab.id }); }} className={`tab ${activeTab === tab.id ? "active" : ""}`} draggable onDragStart={e => { e.dataTransfer.setData("application/x-termix-tab", tab.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={e => { if (e.dataTransfer.types.includes("application/x-termix-tab")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("application/x-termix-tab"); setTabs(old => { const moved = old.find(t => t.id === from); if (!moved || from === tab.id) return old; const next = old.filter(t => t.id !== from); next.splice(next.findIndex(t => t.id === tab.id), 0, moved); return next; }); }} onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}><button role="tab" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} title={tab.connection?.host ? `${tab.title} · ${tab.connection.host}:${tab.connection.port}` : tab.title} onClick={() => { setKeyboardTabs(false); setActiveTab(tab.id); popouts[tab.id]?.focus(); }}><Terminal size={16}/><span>{tab.pinned ? "• " : ""}{tab.title}{popouts[tab.id] && " ↗"}</span></button><button className="tab-close tab-more" aria-label={ui("Actions for ", "Aktionen für ") + tab.title} aria-haspopup="menu" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setTabMenu({id: tab.id, x: rect.left, y: rect.bottom}); }}><MoreHorizontal size={15}/></button><button className="tab-close" aria-label={`${tr("closeTab")}: ${tab.title}`} onClick={() => closeTab(tab.id)}><X size={15}/></button></div> )}</div><div className="tabbar-actions">
        {(tabScroll.left || tabScroll.right) && <>
          <button className="new-tab" disabled={!tabScroll.left} onClick={() => scrollTabs(-1)} aria-label={ui("Scroll tabs left", "Tabs nach links scrollen")} title={ui("Scroll tabs left", "Tabs nach links scrollen")}><ChevronLeft size={17}/></button>
          <button className="new-tab" disabled={!tabScroll.right} onClick={() => scrollTabs(1)} aria-label={ui("Scroll tabs right", "Tabs nach rechts scrollen")} title={ui("Scroll tabs right", "Tabs nach rechts scrollen")}><ChevronRight size={17}/></button>
        </>}
        <button className="new-tab" disabled={!configured} onClick={addLocalTab} title={tr("newTab")} aria-label={tr("newTab")}><Plus size={19}/></button></div></div>
      <div className={`terminal-and-files sftp-${visible.sftpSide}`}><div className="terminal-area">{startupError ? <div className="workspace-empty" role="alert"><h2>{tr("loadFailed")}</h2><p>{errorText(startupError, lang)}</p><button className="btn primary" onClick={() => setRetry(v => v + 1)}>{tr("retry")}</button></div> : !tabs.length && <div className="workspace-empty"><img src="/termix.svg" alt=""/><h2>{tr("emptyTitle")}</h2><p>{tr("emptyIntro")}</p><button className="btn primary" disabled={!configured} onClick={addLocalTab}><Plus size={18}/>{tr("openTerminal")}</button></div>}
      {splitVisible && <>
      {splitColumns > 1 && <SplitDivider vertical position={columnBoundary} max={splitColumns === 3 ? Math.floor(secondBoundary - 15) : 75} onChange={value => { if (splitColumns === 3) setSplitColumnSecond(Math.round(secondBoundary)); setSplitColumn(value); }} label={ui("Resize terminal columns", "Terminalspalten vergrößern")}/>}
      {splitColumns === 3 && <SplitDivider vertical position={secondBoundary} min={Math.ceil(columnBoundary + 15)} max={85} onChange={setSplitColumnSecond} label={ui("Resize terminal columns 2 and 3", "Terminalspalten 2 und 3 anpassen")}/>}
      {splitRows > 1 && <SplitDivider position={rowBoundary} onChange={setSplitRow} label={ui("Resize terminal rows", "Terminalzeilen vergrößern")}/>}
      </>}
      {tabs.map(tab => <div key={tab.id} className={`terminal-layer ${splitVisible?.includes(tab.id) ? "split-layer" : ""} ${tab.id === activeTab ? "active-layer" : ""}`} onPointerDown={() => { if (splitVisible) setActiveTab(tab.id); }} style={{ display: activeTab === tab.id || splitVisible?.includes(tab.id) ? "flex" : "none", flexDirection: "column", ...(splitVisible?.includes(tab.id) ? { inset: "auto", top:`${offset(Math.floor(splitVisible.indexOf(tab.id)/splitColumns), splitRows, rowBoundary)}%`,left:`${columnEdges[splitVisible.indexOf(tab.id)%splitColumns]}%`,width:`${columnEdges[splitVisible.indexOf(tab.id)%splitColumns + 1] - columnEdges[splitVisible.indexOf(tab.id)%splitColumns]}%`,height:`${splitRows === 1 ? 100 : splitVisible.indexOf(tab.id) < splitColumns ? rowBoundary : 100-rowBoundary}%`,padding:"5px" } : {}) }}>{splitVisible?.includes(tab.id)&&<div className="split-pane-heading"><Terminal size={15} aria-hidden="true"/><strong title={tab.title}>{tab.title}</strong><span>{tab.kind === "ssh" ? "SSH" : ui("Local", "Lokal")}</span><button className="icon-button small" aria-label={`${lang==="de"?"Terminal fokussieren":"Focus terminal"}: ${tab.title}`} title={lang==="de"?"Einzeln anzeigen":"Show on its own"} onClick={()=>{setActiveTab(tab.id);setSplit(null);}}>↗</button></div>}<TerminalWindow popup={popouts[tab.id]} title={tab.title} appearanceKey={`${theme}:${lang}:${visible.accent}:${visible.uiScale}`} returnLabel={ui("Return to workspace", "Zurück zum Arbeitsbereich")} onReturn={() => reattachTerminal(tab.id, popouts[tab.id])}><Suspense fallback={<span role="status">{tr("openTerminal")}…</span>}><TerminalPane onUserInput={text => { if (macroVisible.current) macroInput.current?.(`${tab.id}:${tab.transportId ?? ""}`, text); }} onInputReady={write => markInput(tab.id, write)} tab={tab} onOpenOutput={text => {
        if (visible.editor === "integrated") setTerminalOutput({title: tab.title, text});
        else void run(async () => { await invoke("editor_terminal_output", {text}); });
      }} active={activeTab === tab.id && !modalOpen} focusOnActivate={!keyboardTabs} fontSize={tab.fontSize ?? visible.fontSize} theme={visible.terminalPalette === "auto" ? theme : visible.terminalPalette} accent={visible.accent} language={lang} onReconnect={() => { const session = tab.temporary ? tab.connection : catalog.sessions.find(s => s.id === tab.sessionId) ?? tab.connection; if (session) setSshTarget({ session, replaces: tab.id, temporary: tab.temporary }); if (popouts[tab.id]) window.focus(); }}/></Suspense></TerminalWindow></div>)}</div>{visible.sftpLayout === "panel" && filesOpen && activeTransport && <><div className="pane-resizer" role="separator" aria-label={lang === "de" ? "Dateibrowser vergrößern" : "Resize file browser"} aria-orientation="vertical" aria-valuenow={filesWidth} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setFilesWidth(w => Math.max(280, Math.min(window.innerWidth * .6, w + (e.key === "ArrowLeft" ? 20 : -20)))); } }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setFilesWidth(Math.max(280, Math.min(window.innerWidth * .6, visible.sftpSide === "right" ? window.innerWidth - e.clientX : e.clientX - sidebarWidth - 6))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}/><div className="files-container" style={{ width: filesWidth }}><Suspense fallback={<span>SFTP…</span>}><SftpPane key={activeTransport} id={activeTransport} language={lang} initialPath={visible.sftpStart} theme={theme} onEdit={path => visible.editorOpenMode==="external"?setExternalRequest({id:activeTransport,path,nonce:makeId()}):setRemoteEditor({id:activeTransport,path})} onClose={() => setFilesOpen(false)}/></Suspense></div></>}</div>
      {activeTransport&&<Suspense fallback={null}><RemoteMonitor key={activeTransport} id={activeTransport} language={lang}/></Suspense>}
      <footer className="statusbar"><span title={status ? errorText(status, lang) : ""}><Activity size={15}/>{status ? errorText(status, lang) : notice ? tr(notice) : tabs.find(tab => tab.id === activeTab)?.kind === "ssh" ? "SSH" : tr("localWorkspace")}</span><span><HardDrive size={15}/>{catalog.sessions.length} {tr("sessions")}</span><span>{tabs.find(tab => tab.id === activeTab)?.fontSize ?? visible.fontSize} px<span className="status-divider">/</span>UTF-8</span><div id="external-files-slot"/></footer>
      {status && !modalOpen && <div className="workspace-notice" role="alert"><span>{errorText(status, lang)}</span>{status === "session_changed" && <button className="btn secondary" disabled={busy} onClick={() => void run(async () => { setCatalog(await reloadCatalog()); })}>{tr("reloadLibrary")}</button>}<button className="icon-button" aria-label={tr("closeDialog")} onClick={() => setStatus("")}><X size={17}/></button></div>}
    </main></div>
    {layout && <Modal title={ui("Split view", "Ansicht teilen")} closeLabel={tr("closeDialog")} onClose={() => setLayout(false)} footer={null}>
      <p className="hint split-availability">{tabs.length < 6 ? ui("Open more terminals to enable larger layouts.", "Öffne weitere Terminals für größere Ansichten.") : ui("Choose how open terminals are arranged.", "Wähle die Anordnung der offenen Terminals.")}</p>
      <div className="split-options">
        {[
          {count: 1, columns: 1, vertical: false, label: ui("Single terminal", "Ein Terminal")},
          {count: 2, columns: 2, vertical: false, label: ui("Side by side", "Nebeneinander")},
          {count: 2, columns: 1, vertical: true, label: ui("Stacked", "Übereinander")},
          ...[3, 4, 5, 6].map(count => ({count, columns: count === splitVisible?.length && verticalSplit ? 2 : 3, vertical: count === splitVisible?.length && verticalSplit, label: `${count} Terminals`})),
        ].map(({count, columns, vertical, label}) => {
          const selected = count === (splitVisible?.length ?? 1) && (count === 1 || vertical === verticalSplit);
          return <button key={label} className="split-option" aria-pressed={selected} disabled={tabs.length < count} onClick={() => {
            if (count === 1) setSplit(null);
            else { setVerticalSplit(vertical); startSplit(activeTab, count); }
            setLayout(false);
          }}>
            <span className="split-preview" aria-hidden="true" style={{gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(count / columns)}, 1fr)`}}>
              {Array.from({length: count}, (_, index) => <span key={index}/>)}
            </span>
            {label}
          </button>;
        })}
      </div>
    </Modal>}
    {multi && <Modal title="Multi-Execute" closeLabel={tr("closeDialog")} busy={multiBusy} onClose={() => setMulti(false)} footer={
      reviewMatches
        ? <button className="btn primary" disabled={multiBusy} onClick={() => void sendMulti()}>{ui("Send to all listed terminals", "An alle angezeigten Terminals senden")}</button>
        : <button className="btn primary" disabled={targets.length < 2 || !multiCommand.trim() || /[\x00-\x1f\x7f]/.test(multiCommand)} onClick={() => {setMultiResult("");setReview({command: multiCommand, targets});}}>{ui("Review command", "Ausführung prüfen")}</button>
    }>
      <label className="field">{ui("Command", "Befehl")}<input value={multiCommand} maxLength={4096} readOnly={multiBusy} onChange={event => { setMultiCommand(event.target.value); setReview(null); setMultiResult(""); }}/></label>
      <p>{ui("Targets in this split view", "Ziele in dieser Split-Ansicht")}</p>
      <p className="hint">{ui("Check that each target is at a shell prompt with an empty command line.", "Prüfe, ob jedes Ziel an einer Eingabeaufforderung mit leerer Befehlszeile wartet.")}</p>
      <ul className="multi-targets">{targets.map(({tab}) => <li key={tab.id}><Terminal size={16} aria-hidden="true"/><div><strong>{tab.title}</strong><small>{tab.connection?.host ? `${tab.connection.username}@${tab.connection.host}:${tab.connection.port}` : tab.profile ?? tab.kind}</small></div></li>)}</ul>
      {reviewMatches && <pre className="multi-preview">{review.command}</pre>}
      {review && !reviewMatches && <p role="status">{ui("Targets changed. Review again.", "Die Ziele haben sich geändert. Bitte erneut prüfen.")}</p>}
      {multiResult && <p role="status">{multiResult}</p>}
    </Modal>}
    {help && <Modal title={ui("Help and about TermiX", "Hilfe zu TermiX")} closeLabel={tr("closeDialog")} onClose={() => setHelp(false)} onBackdrop={() => setHelp(false)} footer={null}>
      <div className="about-termix"><img src="/termix.svg" alt=""/><div><strong>TermiX</strong><small>{ui("Version", "Version")} {version}</small></div></div>
      <div className="help-links">{[
        {label: ui("Project", "Projektseite"), path: "project", icon: Globe},
        {label: ui("Changelog", "Versionshinweise"), path: "changelog", icon: FileText},
        {label: ui("Updates", "Aktualisierungen"), path: "updates", icon: Download},
        {label: ui("Documentation", "Dokumentation"), path: "documentation", icon: BookOpen},
      ].map(({label, path, icon: Icon}) => <button className="btn secondary" key={path} onClick={() => {
        setHelpError("");
        void invoke("open_project_link", {page: path}).catch(() => setHelpError(ui("Could not open the project link.", "Der Projektlink konnte nicht geöffnet werden.")));
      }}><Icon size={17} aria-hidden="true"/>{label}<ExternalLink size={13} aria-hidden="true"/></button>)}</div>
      {helpError && <p role="alert">{helpError}</p>}
      <div className="help-topics">
        <details open><summary>{ui("Tabs and split view", "Tabs und Split-Ansicht")}</summary><p>{ui("Use the mouse wheel over the tab strip or the arrow buttons to scroll. Split view arranges up to six open terminals.", "Scrolle mit dem Mausrad über der Tab-Leiste oder mit den Pfeilschaltflächen. In der Split-Ansicht kannst du bis zu sechs offene Terminals anordnen.")}</p></details>
        <details><summary>Multi-Execute</summary><p>{ui("With at least two ready terminals in the split view, review all recipients before sending a command.", "Sind mindestens zwei Terminals in der Split-Ansicht bereit, kannst du vor dem Senden alle Ziele prüfen.")}</p></details>
        <details><summary>{ui("Reconnect SSH", "SSH erneut verbinden")}</summary><p>{ui("Press R in the active disconnected SSH terminal to reconnect.", "Drücke R im aktiven, getrennten SSH-Terminal, um die Verbindung wiederherzustellen.")}</p></details>
      </div>
    </Modal>}
    {palette && <Modal title={lang === "de" ? "Befehlspalette" : "Command palette"} closeLabel={tr("cancel")} onClose={() => setPalette(false)} footer={<span>Ctrl+Shift+P</span>}><input autoFocus aria-label={lang === "de" ? "Befehl suchen" : "Search commands"} value={commandQuery} onChange={e => setCommandQuery(e.target.value)}/><div className="command-list">{[
      {name: tr("newTab"), action: addLocalTab}, {name: tr("settings"), action: () => setPreferencesMode("settings")}, {name: "SFTP", action: () => setFilesOpen(true)}, {name: lang === "de" ? "Terminals teilen" : "Split terminals", action: () => startSplit(activeTab)}, {name: lang === "de" ? "Teilung aufheben" : "Remove split", action: () => setSplit(null)}, {name: lang === "de" ? "Fokusansicht umschalten" : "Toggle focus view", action: () => setWorkspaceFull(v => !v)}, {name: lang === "de" ? "Befehlsbausteine" : "Command snippets", action: () => { setCommandsOpen(true); setFilesOpen(false); }}
    ].filter(item => item.name.toLocaleLowerCase(lang).includes(commandQuery.toLocaleLowerCase(lang))).map(item => <button className="btn secondary" key={item.name} onClick={() => { setPalette(false); item.action(); }}>{item.name}</button>)}</div></Modal>}
    {tabMenu && menuTab && <ContextMenu {...tabMenu} onClose={() => setTabMenu(null)} items={[
      {label: "Tab", heading: true},
      {icon: Pencil, label: lang === "de" ? "Tab umbenennen" : "Rename tab", action: () => setRename({id: menuTab.id, title: menuTab.title})},
      {icon: Copy, label: lang === "de" ? "Tab duplizieren" : "Duplicate tab", action: () => { if (menuTab.connection && menuTab.temporary) setSshTarget({session: menuTab.connection, temporary: true}); else if (menuTab.connection) openSession(menuTab.connection); else if (preferences) { const tab = localTab({...preferences, defaultShell: menuTab.profile ?? preferences.defaultShell}); setTabs(old => [...old, tab]); setActiveTab(tab.id); } }},
      {icon: Pin, label: lang === "de" ? "Anheften / lösen" : "Pin / unpin tab", action: () => setTabs(old => old.map(t => t.id === menuTab.id ? {...t, pinned: !t.pinned} : t))},
      {label:lang==="de"?"Tab-Farbe":"Tab colour",swatches:[["#5b9cf5","Blue","Blau"],["#71c9bd","Teal","Türkis"],["#b692f6","Purple","Violett"],["#ef9b63","Orange","Orange"]].map(([colour,en,de])=>({colour,label:lang==="de"?de:en,selected:menuTab.color===colour,action:()=>setTabs(old=>old.map(t=>t.id===menuTab.id?{...t,color:colour}:t))}))},
      {icon: Maximize, label: popouts[menuTab.id] ? ui("Return to workspace", "Zurück zum Arbeitsbereich") : ui("Detach terminal", "Terminal abtrennen"), action: () => popouts[menuTab.id] ? reattachTerminal(menuTab.id, popouts[menuTab.id]) : detachTerminal(menuTab.id)},
      {label:lang==="de"?"Anordnung":"Layout",heading:true},
      {icon: Pencil, label: ui("Custom tab colour…", "Eigene Tab-Farbe …"), action: () => setTabColour({id: menuTab.id, value: menuTab.color ?? visible.accent})},
      {icon: Columns2, label: lang === "de" ? "Terminals teilen" : "Split terminals", disabled: tabs.length < 2, action: () => startSplit(menuTab.id)},
      ...[3,4,5,6].map(count=>({icon: Columns2, label:lang==="de"?`Bis zu ${count} Terminals anzeigen`:`Show up to ${count} terminals`,disabled:tabs.length<2,action:()=>startSplit(menuTab.id,count)})),
      {icon: RotateCw, label: lang === "de" ? "Teilung drehen" : "Rotate split", disabled: !splitVisible, action: () => setVerticalSplit(v => !v)},
      {icon: Maximize, label: lang === "de" ? "Teilung aufheben" : "Remove split", disabled: !splitVisible, action: () => setSplit(null)},
      {icon: Maximize, label: lang === "de" ? "Fokusansicht umschalten" : "Toggle focus view", action: () => setWorkspaceFull(v => !v)},
      {label:lang==="de"?"Schließen":"Close",heading:true},
      {icon: ArrowLeft, label: lang === "de" ? "Tabs links schließen" : "Close tabs to the left", action: () => closeMany(tabs.slice(0, tabs.indexOf(menuTab)).map(t => t.id))},
      {icon: ArrowRight, label: lang === "de" ? "Tabs rechts schließen" : "Close tabs to the right", action: () => closeMany(tabs.slice(tabs.indexOf(menuTab) + 1).map(t => t.id))},
      {icon: X, label: lang === "de" ? "Andere Tabs schließen" : "Close other tabs", action: () => closeMany(tabs.filter(t => t.id !== menuTab.id).map(t => t.id))},
      {icon: X, label: lang === "de" ? "Alle unangehefteten Tabs schließen" : "Close all unpinned tabs", action: () => closeMany(tabs.map(t => t.id))},
      {icon: X, label: tr("closeTab"), action: () => closeTab(menuTab.id)}
    ]}/>}
    {tabColour && <Modal title={ui("Custom tab colour", "Eigene Tab-Farbe")} closeLabel={tr("cancel")} onClose={() => setTabColour(null)}
      footer={<button className="btn primary" onClick={() => {
        setTabs(old => old.map(tab => tab.id === tabColour.id ? {...tab, color: tabColour.value} : tab));
        setTabColour(null);
      }}>{tr("saveChanges")}</button>}>
      <label className="field">{ui("Colour", "Farbe")}<input type="color" value={tabColour.value} onChange={event => setTabColour({...tabColour, value: event.target.value})}/></label>
    </Modal>}
    {terminalOutput && <Suspense fallback={<div role="status">{ui("Opening editor…", "Editor wird geöffnet …")}</div>}>
      <OutputEditor {...terminalOutput} language={lang} theme={theme} onClose={() => setTerminalOutput(null)}/>
    </Suspense>}
    {rename && <Modal title={lang === "de" ? "Tab umbenennen" : "Rename tab"} closeLabel={tr("cancel")} onClose={() => setRename(null)} footer={<button className="btn primary" disabled={!rename.title.trim()} onClick={() => { setTabs(old => old.map(t => t.id === rename.id ? {...t, title: rename.title.trim()} : t)); setRename(null); }}>{tr("saveChanges")}</button>}><input aria-label={lang === "de" ? "Tabname" : "Tab name"} maxLength={100} value={rename.title} onChange={e => setRename({...rename, title: e.target.value})}/></Modal>}
    <Suspense fallback={null}><ExternalEditManager reminders={visible.externalFileReminders ?? true} request={externalRequest} language={lang} onHandled={nonce=>{if(externalRequest?.nonce===nonce){const target=activeTerminalRef.current;if(target?.transportId===externalRequest.id)inputs.current.get(target.id)?.("");}setExternalRequest(old=>old?.nonce===nonce?null:old);}}/></Suspense>
    {tunnelId&&tunnelTarget&&<Suspense fallback={null}><TunnelDialog id={tunnelId} title={tunnelTarget?.connection?`${tunnelTarget.title} · ${tunnelTarget.connection.username}@${tunnelTarget.connection.host}:${tunnelTarget.connection.port}`:tunnelTarget?.title??"SSH"} language={lang} onClose={()=>setTunnelId(null)}/></Suspense>}
    <Suspense fallback={null}>{Object.entries(editorRequests).map(([id, request]) =>
      <EditorDialog key={id} id={id} initialPath={request.path} request={request.nonce}
        visible={remoteEditor === id} onHide={() => setVisibleEditor(null)} language={lang} theme={theme}
        externalAvailable={visible.editor !== "integrated" && !!visible.editorPath}/>
    )}</Suspense>
    {!!closeWarnings.length && <Modal className="confirmation-dialog" title={ui("Close TermiX?", "TermiX schließen?")} closeLabel={tr("cancel")}
      onClose={() => setCloseWarnings([])} footer={<>
        <button className="btn secondary" onClick={() => setCloseWarnings([])}>{tr("cancel")}</button>
        <button className="btn primary" onClick={() => void run(async () => {
          await getCurrentWindow().destroy();
          setCloseWarnings([]);
        })}>{ui("Close TermiX", "TermiX schließen")}</button>
      </>}>{closeWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</Modal>}
    {preferencesMode && preferences && <PreferencesDialog mode={preferencesMode} profiles={profiles} initial={preferences} shortcuts={shortcuts} onSave={applyPreferences} onPreview={setPreview} onClose={() => { setPreview(null); setPreferencesMode(null); }}/ >}
    {editor && <SessionDialog key={editor.session.id} initial={editor.session} editing={editor.editing} folders={catalog.folders} profiles={profiles} language={lang} onSave={persistSession} onClose={() => setEditor(null)}/>}
    {folderEditor && <FolderDialog initial={folderEditor} language={lang} onClose={() => setFolderEditor(null)} onSave={async folder => { updateCatalog(await library(saveFolder(folder))); setFolderEditor(null); }}/ >}
    {confirm && <ConfirmDialog title={`${tr(confirm.kind === "folder" ? "deleteFolder" : "deleteSession")} · ${confirm.name}`} note={tr(confirm.kind === "folder" ? "folderDeleteNote" : "confirmDeleteSession")} language={lang} onClose={() => setConfirm(null)} onConfirm={async () => {
      if (confirm.kind === "folder") { updateCatalog(await library(deleteFolder(confirm.id))); if (view === `folder:${confirm.id}`) setView("unassigned"); }
      else { await library(deleteSession(confirm.id)); updateCatalog(await getCatalog()); }
      setConfirm(null);
    }}/ >}
    {workspaceConfirmation.dialog}
    {pingResult && <Modal title="Ping" closeLabel={tr("closeDialog")} onClose={() => setPingResult(null)}>
      <p><strong>{pingResult.host}</strong>{pingResult.host !== pingResult.address && <> · {pingResult.address}</>}</p>
      <p role="status">{pingResult.roundTripMs === null ? ui("No ICMP echo reply.", "Keine ICMP-Echo-Antwort.") : ui(`Echo reply in ${pingResult.roundTripMs} ms.`, `Echo-Antwort nach ${pingResult.roundTripMs} ms.`)}</p>
    </Modal>}
    {batchPicker && <BatchSessionDialog catalog={catalog} language={lang} onClose={() => setBatchPicker(false)} onOpen={sessions => { setBatchPicker(false); openSshBatch(sessions); }}/>}
    {sshImport && <Modal title={sshImport.format === "moba" ? (lang === "de" ? "MobaXterm-Sitzungen importieren" : "Import MobaXterm sessions") : sshImport.format === "putty" ? (lang === "de" ? "PuTTY-Sitzungen importieren" : "Import PuTTY sessions") : (lang === "de" ? "OpenSSH-Konfiguration importieren" : "Import OpenSSH configuration")} closeLabel={lang === "de" ? "Schließen" : "Close"} onClose={() => setSshImport(null)} busy={busy}>
      <p>{sshImport.format === "moba" ? (lang === "de" ? "Wähle einen .mxtsessions-Export. TermiX übernimmt Name, Host, Port und Benutzer für direkte SSH-Verbindungen. Prüfe die Ziele, falls bisher ein Proxy oder Gateway verwendet wurde." : "Choose an .mxtsessions export. TermiX imports names, hosts, ports and users for direct SSH connections. Review the destinations if you previously used a proxy or gateway.") : sshImport.format === "putty" ? (lang === "de" ? "Wähle eine aus PuTTY exportierte .reg-Datei mit SSH-Sitzungen." : "Choose a PuTTY .reg export containing SSH sessions.") : lang === "de" ? "Wähle eine lokale Konfigurationsdatei. Importiert werden einzelne Host-Einträge mit HostName, User und optionalem Port." : "Choose a local configuration file. Individual Host entries with HostName, User and an optional Port can be imported."}</p>
      {sshImport.format !== "openssh" && <p>{ui("Entries without a saved SSH username are skipped.", "Einträge ohne gespeicherten SSH-Benutzernamen werden übersprungen.")}</p>}
      <input type="file" accept={sshImport.format === "putty" ? ".reg" : sshImport.format === "moba" ? ".mxtsessions" : undefined} aria-label={lang === "de" ? "Importdatei" : "Import file"} disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0];
        const {folder, format} = sshImport;
        event.currentTarget.value = "";
        if (!file) return;
        void run(async () => {
          setSshImport(null);
          if (file.size > 256 * 1024) throw (lang === "de" ? "Die Konfigurationsdatei darf höchstens 256 KiB groß sein." : "The configuration file must be 256 KiB or smaller.");
          const contents = await file.arrayBuffer();
          const group = folder?.id ?? "";
          const readText = () => new TextDecoder("utf-8", {fatal: true}).decode(contents);
          const sessions = format === "putty" ? readPuttySessions(contents, group)
            : format === "moba" ? readMobaSessions(readText(), group)
            : readOpenSshSessions(readText(), group);
          if (!sessions.length || sessions.length > 200) throw (lang === "de" ? "Die Datei muss 1 bis 200 unterstützte Host-Einträge enthalten." : "The file must contain 1 to 200 supported host entries.");
          setIncoming({schemaVersion: 2, revision: 0, folders: folder ? [folder] : [], sessions});
        });
      }}/>
    </Modal>}
    {incoming && <ImportDialog catalog={incoming} language={lang} onClose={() => setIncoming(null)} onConfirm={async () => { updateCatalog(await library(importSessions(incoming))); setIncoming(null); setNotice("importDone"); }}/ >}
    {sshTarget && <Suspense fallback={<div role="status">{tr("connecting")}</div>}><SshDialog key={sshTarget.session.id} session={sshTarget.session} temporary={sshTarget.temporary} language={lang} onClose={() => { batchQueue.current = []; setSshTarget(null); }} onConnected={connected}/></Suspense>}
  </div>;
}

function SplitDivider({vertical = false, position, onChange, label, min = 20, max = 75}: {vertical?: boolean; position: number; min?: number; max?: number; onChange: (value: number) => void; label: string}) {
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  return <div className={`split-divider ${vertical ? "vertical" : "horizontal"}`}
    role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} aria-label={label}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(position)} tabIndex={0}
    style={vertical ? {left: `${position}%`} : {top: `${position}%`}}
    onPointerDown={event => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!bounds || !bounds.width || !bounds.height) return;
      onChange(clamp(100 * (vertical ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height)));
    }}
    onKeyDown={event => {
      const less = vertical ? "ArrowLeft" : "ArrowUp", more = vertical ? "ArrowRight" : "ArrowDown";
      if (event.key !== less && event.key !== more) return;
      event.preventDefault();
      onChange(clamp(position + (event.key === less ? -5 : 5)));
    }}/>
}
