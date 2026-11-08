"""One-time user-authorized cleanup: exact allowlist, expected tips and ancestry."""
import json, os, subprocess, urllib.parse
repo = os.environ['GH_REPO']
retired = {
 'codex/v0.2-local-terminal':'fb51f303d07f3ea375156be3af57679d3a6720ac',
 'codex/v0.4-session-manager':'fb51f303d07f3ea375156be3af57679d3a6720ac',
 'codex/v0.5-sftp-workspace':'df84e11e0bccee832cb0b643bf65981d0655ef2a',
 'codex/v0.6-editor-windows-fixes':'003aa027d8d6440089a10023ce109a383d8b6169',
 'codex/v0.7-workspace-productivity':'1fe2f84a0412fb268b569351477f6cf25ef46131',
 'codex/v0.8-portable-workflows':'81205dc3de017a3772955ecb9814ee8540efb8e9',
 'codex/v0.9-monitoring-rendering':'4e54ab96b2ce798b1c0ee3aadc39ff1f65c041b2',
 'codex/v0.10-tunnels-workflows':'3be58d480a926d870c957a61ee82a3f5fa52ea2c',
}
branches = json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/branches?per_page=100'],text=True))
for branch in branches:
 name=branch['name']; tip=branch['commit']['sha']
 if name not in retired: continue
 if tip != retired[name] or branch['protected']:
  print('Preserving changed/protected branch:',name); continue
 if subprocess.run(['git','merge-base','--is-ancestor',tip,'HEAD']).returncode:
  print('Preserving unintegrated branch:',name); continue
 subprocess.run(['gh','api','--method','DELETE',f'repos/{repo}/git/refs/heads/{urllib.parse.quote(name,safe="")}'],check=True)
 print('Removed integrated branch:',name)
