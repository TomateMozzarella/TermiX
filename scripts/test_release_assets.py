import hashlib, json, pathlib, tempfile, unittest
from release_assets import verify_installers

class ReleaseAssets(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.temp.name)
        self.manifest = {'schemaVersion': 1, 'version': '0.4.0', 'commit': 'a' * 40, 'runId': 42, 'files': []}
        for suffix in ('.exe', '.msi'):
            name = 'TermiX_0.4.0_x64' + suffix
            data = b'test-only installer fixture ' + suffix.encode()
            (self.root / name).write_bytes(data)
            self.manifest['files'].append({'name': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        self.save()
    def tearDown(self): self.temp.cleanup()
    def save(self):
        (self.root / 'release-manifest.json').write_text(json.dumps(self.manifest), encoding='utf8')
        (self.root / 'SHA256SUMS').write_text(''.join(r['sha256'] + '  ' + r['name'] + '\n' for r in self.manifest['files']), encoding='utf8')
    def verify(self): return verify_installers(self.root, '0.4.0', 'a' * 40, 42)
    def test_exact_verified_receipt_accepts_both_installers(self): self.assertEqual(len(self.verify()), 4)
    def test_portable_receipt_accepts_only_distributable_files(self):
        import zipfile
        name='TermiX_0.4.0_x64-portable.zip'
        with zipfile.ZipFile(self.root/name,'w') as archive:
            for entry in ['TermiX.exe','portable.flag','README.txt','termix-v3.ico','THIRD_PARTY_LICENSES.txt']: archive.writestr(entry,b'fixture')
        self.manifest['schemaVersion']=2
        data=(self.root/name).read_bytes()
        self.manifest['files'].append({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
        self.save(); self.assertEqual(len(self.verify()),5)
        with zipfile.ZipFile(self.root/name,'a') as archive: archive.writestr('data/commands.json',b'must-not-ship')
        data=(self.root/name).read_bytes();self.manifest['files'][-1].update(sha256=hashlib.sha256(data).hexdigest(),bytes=len(data));self.save()
        with self.assertRaises(RuntimeError): self.verify()
    def test_another_source_commit_is_rejected(self):
        self.manifest['commit'] = 'b' * 40; self.save()
        with self.assertRaises(RuntimeError): self.verify()
    def test_another_workflow_run_is_rejected(self):
        self.manifest['runId'] = 41; self.save()
        with self.assertRaises(RuntimeError): self.verify()
    def test_tampered_installer_is_rejected(self):
        (self.root / self.manifest['files'][0]['name']).write_bytes(b'tampered')
        with self.assertRaises(RuntimeError): self.verify()
    def test_path_traversal_in_receipt_is_rejected(self):
        self.manifest['files'][0]['name'] = '../TermiX_0.4.0_x64.exe'; self.save()
        with self.assertRaises(RuntimeError): self.verify()
    def test_missing_installer_is_rejected(self):
        (self.root / self.manifest['files'][1]['name']).unlink()
        with self.assertRaises(RuntimeError): self.verify()
    def test_changed_checksum_list_is_rejected(self):
        (self.root / 'SHA256SUMS').write_text('incorrect')
        with self.assertRaises(RuntimeError): self.verify()

if __name__ == '__main__': unittest.main()
