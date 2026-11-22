import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { Language } from "./i18n";

export type SearchMode = "find" | "replace" | "line";

export function EditorSearch({ mode, editor, language, revision, readOnly, onClose }: {
  mode: SearchMode;
  editor?: Monaco.editor.IStandaloneCodeEditor;
  language: Language;
  revision: string;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const tr = (en: string, de: string) => language === "de" ? de : en;
  const [query, setQuery] = useState(""), [replacement, setReplacement] = useState("");
  const [caseSensitive, setCase] = useState(false), [wholeWord, setWholeWord] = useState(false);
  const [wrap, setWrap] = useState(true), [index, setIndex] = useState(-1);
  const [line, setLine] = useState("");
  const revisionRef = useRef(revision);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, [mode]);
  const model = editor?.getModel();
  const matches = mode !== "line" && query && model
    ? model.findMatches(query, false, false, caseSensitive, wholeWord ? editor!.getOption(Monaco.editor.EditorOption.wordSeparators) : null, false, 10001) : [];
  const capped = matches.length > 10000;
  const selected = revisionRef.current === revision ? index : -1;

  function go(backwards: boolean) {
    if (!matches.length || !editor) return;
    let next = selected < 0 ? (backwards ? matches.length - 1 : 0) : selected + (backwards ? -1 : 1);
    if (next < 0 || next >= matches.length) {
      if (!wrap) return;
      next = (next + matches.length) % matches.length;
    }
    revisionRef.current = revision;
    setIndex(next);
    editor.setSelection(matches[next].range);
    editor.revealRangeInCenterIfOutsideViewport(matches[next].range);
  }

  function replace(all: boolean) {
    if (!editor || readOnly || !matches.length || capped) return;
    editor.pushUndoStop();
    const targets = all ? matches : [matches[Math.max(0, selected)]];
    editor.executeEdits("termix-replace", targets.map(match => ({range: match.range, text: replacement})));
    editor.pushUndoStop();
    setIndex(-1);
  }

  return <section className="editor-search-panel" aria-label={tr("Editor search", "Editorsuche")} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); editor?.focus(); }
  }}>
    {mode === "line" ? <form className="editor-search-row" onSubmit={event => {
      event.preventDefault();
      if (!editor || !model) return;
      const lineNumber = Math.min(Number(line), model.getLineCount());
      if (!Number.isInteger(lineNumber) || lineNumber < 1) return;
      editor.setPosition({lineNumber, column: 1});
      editor.revealLineInCenter(lineNumber);
      onClose();
      editor.focus();
    }}>
      <input ref={input} type="number" min="1" required aria-label={tr("Line number", "Zeilennummer")} placeholder={tr("Line number", "Zeilennummer")} value={line} onChange={event => setLine(event.target.value)}/>
      <button className="btn secondary">{tr("Go", "Springen")}</button>
    </form> : <>
      <form className="editor-search-row" onSubmit={event => { event.preventDefault(); go(false); }}>
        <input ref={input} aria-label={tr("Find text", "Suchtext")} placeholder={tr("Find text", "Suchtext")} value={query} onChange={event => {setQuery(event.target.value); setIndex(-1);}}/>
        <output aria-live="polite">{query && (selected >= 0 ? `${selected + 1} / ` : "")}{query && `${capped ? "10,000+" : matches.length} ${tr("matches", "Treffer")}`}</output>
        <button type="button" className="icon-button" aria-label={tr("Previous match", "Vorheriger Treffer")} disabled={!matches.length} onClick={() => go(true)}><ChevronUp size={17}/></button>
        <button className="icon-button" aria-label={tr("Next match", "Nächster Treffer")} disabled={!matches.length}><ChevronDown size={17}/></button>
      </form>
      <div className="editor-search-options">
        <label><input type="checkbox" checked={caseSensitive} onChange={event => { setCase(event.target.checked); setIndex(-1); }}/>{tr("Match case", "Groß-/Kleinschreibung")}</label>
        <label><input type="checkbox" checked={wholeWord} onChange={event => { setWholeWord(event.target.checked); setIndex(-1); }}/>{tr("Whole words", "Ganze Wörter")}</label>
        <label><input type="checkbox" checked={wrap} onChange={event => setWrap(event.target.checked)}/>{tr("Wrap around", "Am Ende von vorne")}</label>
      </div>
      {mode === "replace" && <div className="editor-search-row">
        <input aria-label={tr("Replacement text", "Ersatztext")} placeholder={tr("Replacement text", "Ersatztext")} value={replacement} onChange={event => setReplacement(event.target.value)}/>
        <button className="btn secondary" disabled={!matches.length || capped} onClick={() => replace(false)}>{tr("Replace match", "Treffer ersetzen")}</button>
        <button className="btn secondary" disabled={!matches.length || capped} onClick={() => replace(true)}>{tr("Replace all", "Alle ersetzen")}</button>
      </div>}
    </>}
    <button className="icon-button editor-search-close" aria-label={tr("Close search", "Suche schließen")} onClick={() => { onClose(); editor?.focus(); }}><X size={17}/></button>
  </section>;
}

