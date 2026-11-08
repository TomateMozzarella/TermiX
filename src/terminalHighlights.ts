import type {Terminal,IDisposable} from '@xterm/xterm';
import {terminalTheme,type ResolvedTheme} from './appearance';
// Display-only decorations: never rewrite server bytes or coloured applications.
export function terminalHighlights(terminal:Terminal,visual:()=>{theme:ResolvedTheme;accent:string}){
 let frame=0,decorations:IDisposable[]=[];
 const clear=()=>{decorations.forEach(d=>d.dispose());decorations=[];};
 const paint=()=>{frame=0;clear();const buffer=terminal.buffer.active;if(buffer.type!=='normal')return;const palette=terminalTheme(visual().theme,visual().accent);
 for(let row=buffer.viewportY;row<Math.min(buffer.length,buffer.viewportY+terminal.rows,buffer.viewportY+100)&&decorations.length<200;row++){
 const line=buffer.getLine(row);if(!line)continue;const text=line.translateToString(true);const pattern=/https?:\/\/[^\s]+|\b(?:\d{1,3}\.){3}\d{1,3}\b|^[\w.-]+@[\w.-]+(?=[:\s])|\b(?:ERROR|FAILED|WARNING|SUCCESS)\b/gi;
 for(const match of text.matchAll(pattern)){const x=match.index!;if(x+match[0].length>terminal.cols)continue;let plain=true;for(let col=0;col<x+match[0].length;col++){const cell=line.getCell(col);if(!cell||cell.getWidth()!==1||(col>=x&&!cell.isFgDefault())){plain=false;break;}}if(!plain)continue;
 const marker=terminal.registerMarker(row-buffer.baseY-buffer.cursorY);if(!marker)continue;const value=match[0];const foregroundColor=/ERROR|FAILED/i.test(value)?palette.red:/WARNING/i.test(value)?palette.yellow:/SUCCESS|@/.test(value)?palette.green:palette.cyan;
 const decoration=terminal.registerDecoration({marker,x,width:Math.min(value.length,terminal.cols-x),foregroundColor});if(decoration)decorations.push(decoration);decorations.push(marker);if(decorations.length>=200)break;
 }} };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};const listeners=[terminal.onWriteParsed(schedule),terminal.onScroll(schedule),terminal.onResize(schedule)];schedule();return{refresh:schedule,dispose:()=>{cancelAnimationFrame(frame);listeners.forEach(l=>l.dispose());clear();}};
}

