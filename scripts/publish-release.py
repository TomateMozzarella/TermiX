"""Publish immutable prereleases only from an exact, successful same-repository build.

main is built and validated before publication. No artifact from another SHA,
fork, failed workflow or expired run may be substituted. Existing releases are
never overwritten. GH_TOKEN is used only by the normal GitHub CLI/API client.
"""
import json, os, pathlib, re, subprocess
from release_assets import verify_installers

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()

def api(path):
    return json.loads(gh('api', path))

repo, commit = os.environ['GH_REPO'], os.environ['TERMIX_COMMIT']
if not re.fullmatch(r'[a-f0-9]{40}', commit): raise RuntimeError('Invalid source commit')
if gh('api', f'repos/{repo}/git/ref/heads/main', '--jq', '.object.sha') != commit:
    raise RuntimeError('main moved; do not publish a stale build')
version = json.loads(pathlib.Path('package.json').read_text())['version']
if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version): raise RuntimeError('Invalid version')
tag = 'v' + version
existing = subprocess.run(['gh', 'release', 'view', tag, '--json', 'tagName,isDraft'], capture_output=True, text=True)
if existing.returncode == 0:
    if json.loads(existing.stdout)['isDraft']: raise RuntimeError('An existing draft needs review; do not silently skip publication or replace assets')
    print(tag + ' already exists; preserving its original assets and source tag')
    raise SystemExit(0)
tag_ref = subprocess.run(['git', 'rev-parse', '--verify', tag + '^{commit}'], capture_output=True, text=True)
if tag_ref.returncode == 0 and tag_ref.stdout.strip() != commit: raise RuntimeError('Existing tag refers to another commit')
notes = pathlib.Path('docs/releases') / (tag + '.md')
if not notes.is_file(): raise RuntimeError('Versioned release notes are missing')
repository_id = api(f'repos/{repo}')['id']
runs = api(f'repos/{repo}/actions/workflows/windows-build.yml/runs?head_sha={commit}&status=success&per_page=100')['workflow_runs']
runs = [run for run in runs if run['head_sha'] == commit and run['status'] == 'completed' and run['conclusion'] == 'success'
        and run['head_repository']['id'] == repository_id
        and run['event'] in ('push', 'workflow_dispatch') and run['head_branch'] == 'main']
if not runs: raise RuntimeError('No successful same-repository build exists for this exact commit')
run = runs[0]
jobs = api(f'repos/{repo}/actions/runs/{run["id"]}/jobs?per_page=100')['jobs']
if any(job['conclusion'] != 'success' for job in jobs) or not {'frontend', 'windows', 'linux-metrics'}.issubset({job['name'] for job in jobs}):
    raise RuntimeError('Required build jobs did not all succeed')
artifacts = api(f'repos/{repo}/actions/runs/{run["id"]}/artifacts')['artifacts']
artifact = next((a for a in artifacts if a['name'] == 'TermiX-Windows-Installer' and not a['expired']), None)
if artifact is None: raise RuntimeError('Verified installer artifact is missing or expired')
directory = pathlib.Path('release-assets')
subprocess.run(['gh', 'run', 'download', str(run['id']), '--name', artifact['name'], '--dir', str(directory)], check=True)
assets = verify_installers(directory, version, commit, run['id'])
# A draft becomes visible only after all assets and notes have been uploaded.
subprocess.run(['gh', 'release', 'create', tag, '--target', commit, '--title', notes.read_text(encoding='utf8').splitlines()[0].removeprefix('# ').strip(),
                '--notes-file', str(notes), '--prerelease', '--draft', *assets], check=True)
subprocess.run(['gh', 'release', 'edit', tag, '--draft=false', '--prerelease'], check=True)
print('Published ' + tag + ' from verified workflow ' + str(run['id']) + ' at ' + commit)
