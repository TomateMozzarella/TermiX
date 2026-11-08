"""Bound native fixture diagnostics so failed binary assertions cannot flood logs."""
import json,os,re,subprocess
repo=os.environ['GH_REPO']
def api(path): return subprocess.check_output(['gh','api','--allow-escape-sequences',f'repos/{repo}/{path}'],text=True)
run=os.environ.get('TERMIX_FAILED_RUN')
if not run:
 runs=json.loads(api('actions/workflows/windows-build.yml/runs?branch=main&status=failure&per_page=5'))['workflow_runs']
 if not runs: print('No failed main build');raise SystemExit(0)
 run=str(runs[0]['id'])
jobs=json.loads(api(f'actions/runs/{run}/jobs?per_page=100'))['jobs']
job=next((j for j in jobs if j['name']=='windows' and j['conclusion']=='failure'),None)
if not job: print('No failed Windows job in run',run);raise SystemExit(0)
print('Native failure in run',run,'job',job['id'])
lines=api(f'actions/jobs/{job["id"]}/logs').splitlines()
remaining=0;printed=0
for line in lines:
 match=re.search(r'FAILED|panicked|Tunnel control|fixture forward|error\[|test result:',line)
 if match: remaining=5
 if remaining and printed<120:
  line=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',line)
  print(line[:1200]+(' [truncated]' if len(line)>1200 else ''));remaining-=1;printed+=1
