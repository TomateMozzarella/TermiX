import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TerminalWindow({children, popup, title, returnLabel, onReturn, appearanceKey}: {
  children: ReactNode; popup?: Window; title: string; appearanceKey: string; returnLabel: string; onReturn: () => void;
}) {
  const returnButton = useRef<HTMLButtonElement | null>(null);
  const placeholder = useRef<HTMLDivElement>(null);
  const [surface] = useState(() => {
    const element = document.createElement("div");
    element.className = "terminal-window-surface";
    return element;
  });
  const move = (parent: HTMLElement) => {
    parent.append(surface);
    surface.querySelector(".terminal-host")?.dispatchEvent(new Event("termix-terminal-moved"));
  };
  useLayoutEffect(() => {
    const home = placeholder.current;
    if (!home) return;
    if (!popup) {
      move(home);
      return;
    }
    try {
      const target = popup.document;
      target.title = `${title} · TermiX`;
      target.documentElement.lang = document.documentElement.lang;
      target.documentElement.dataset.theme = document.documentElement.dataset.theme;
      target.documentElement.style.cssText = document.documentElement.style.cssText;
      target.body.classList.add("terminal-popup");
      for (const stylesheet of document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = stylesheet.href;
        target.head.append(link);
      }
      for (const stylesheet of document.head.querySelectorAll("style")) {
        const style = target.createElement("style");
        style.textContent = stylesheet.textContent;
        target.head.append(style);
      }
      const button = target.createElement("button");
      button.type = "button";
      button.className = "btn secondary terminal-popup-return";
      button.textContent = returnLabel;
      button.onclick = onReturn;
      returnButton.current = button;
      target.body.append(button);
      move(target.body);
      return () => {
        if (home.isConnected) move(home);
        returnButton.current = null;
        button.remove();
      };
    } catch {
      move(home);
      onReturn();
    }
  }, [popup]);
  useEffect(() => {
    if (!popup || popup.closed) return;
    const frame = window.requestAnimationFrame(() => {
      if (popup.closed) return;
      const target = popup.document;
      target.title = `${title} · TermiX`;
      target.documentElement.lang = document.documentElement.lang;
      target.documentElement.dataset.theme = document.documentElement.dataset.theme;
      target.documentElement.style.cssText = document.documentElement.style.cssText;
      if (returnButton.current) returnButton.current.textContent = returnLabel;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [popup, title, returnLabel, appearanceKey]);
  return <>
    <div ref={placeholder} className="terminal-window-home">
      {popup && <button className="btn secondary" onClick={() => popup.focus()}>{title} ↗</button>}
    </div>
    {createPortal(children, surface)}
  </>;
}
