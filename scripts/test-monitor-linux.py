"""Exercise the exact read-only collector against real Linux /proc and tools."""
import pathlib, re, subprocess, sys
if sys.platform != 'linux': raise RuntimeError('Linux collector check requires Linux')
source=pathlib.Path('src-tauri/src/monitor.rs').read_text(encoding='utf8')
matches=re.findall(r'const COMMAND: &str = r#"(.*?)"#;',source,re.S)
if len(matches)!=1: raise RuntimeError('Collector command not found uniquely')
result=subprocess.run(['sh','-c',matches[0]],capture_output=True,text=True,check=True,timeout=8)
if len(result.stdout)>16384: raise RuntimeError('Collector output exceeded bound')
lines=result.stdout.splitlines()
assert lines[0]=='TERMIX_MONITOR_V1'
metrics={parts[0]:[int(value) for value in parts[1:]] for parts in map(str.split,lines[1:])}
assert set(metrics)=={'cpu','mem','disk','uptime','net','ssh','users'}
assert all(value>=0 for row in metrics.values() for value in row)
assert metrics['cpu'][0]>=metrics['cpu'][1]
assert metrics['mem'][0]>0 and metrics['mem'][0]>=metrics['mem'][1]
assert metrics['disk'][0]>0 and metrics['disk'][0]>=metrics['disk'][1]
assert metrics['uptime'][0]>0 and len(metrics['net'])==2
print('Exact Linux collector passed on real /proc, root filesystem, networking and process/login tools.')

