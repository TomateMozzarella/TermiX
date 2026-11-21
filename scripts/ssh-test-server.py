"""Loopback-only SSH protocol fixture. Never uses or prints real credentials."""
import argparse, json, pathlib, socket, threading, time, os, errno, sys
import paramiko
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption, BestAvailableEncryption

parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
parser.add_argument('--port', type=int, default=22222)
args = parser.parse_args()
root = pathlib.Path(args.directory)
root.mkdir(parents=True, exist_ok=True)
host_path = root / 'fixture-host-key'
host_path.write_bytes(Ed25519PrivateKey.generate().private_bytes(Encoding.PEM, PrivateFormat.OpenSSH, NoEncryption()))
host_key = paramiko.Ed25519Key.from_private_key_file(str(host_path))
user_key = paramiko.RSAKey.generate(2048)
user_key.write_private_key_file(str(root / 'user-key.pem'), password='fixture-only')
user_key.write_private_key_file(str(root / 'agent-key.pem'))
paramiko.RSAKey.generate(2048).write_private_key_file(str(root / 'unrelated-agent-key.pem'))
(root / 'user-key.pub').write_text(user_key.get_name() + ' ' + user_key.get_base64())
ed_path = root / 'encrypted-openssh-key'
ed_path.write_bytes(Ed25519PrivateKey.generate().private_bytes(Encoding.PEM, PrivateFormat.OpenSSH, BestAvailableEncryption(b'fixture-only')))
ed_user_key = paramiko.Ed25519Key.from_private_key_file(str(ed_path), password='fixture-only')
lock = threading.Lock()
def event(kind, username=''):
    with lock:
        with (root / 'events.jsonl').open('a', encoding='utf8') as stream:
            stream.write(json.dumps({'event': kind, 'username': username}) + '\n')


remote_root = root / 'remote-files'
remote_root.mkdir(exist_ok=True)
(remote_root / 'hello.txt').write_bytes(b'fixture content')
(remote_root / 'large.bin').write_bytes(b'x' * (1024 * 1024 * 4))
(remote_root / 'folder').mkdir(exist_ok=True)

class FileHandle(paramiko.SFTPHandle):
    def chattr(self, attr):
        try: paramiko.SFTPServer.set_file_attr(str(self.path), attr); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)

class SlowHandle(FileHandle):
    def read(self, offset, length):
        time.sleep(.01)
        return super().read(offset, length)

class Files(paramiko.SFTPServerInterface):
    def local(self, value):
        candidate = (remote_root / value.lstrip('/')).resolve()
        if candidate != remote_root.resolve() and remote_root.resolve() not in candidate.parents:
            raise OSError(errno.EACCES, 'outside fixture')
        return candidate
    def canonicalize(self, value):
        try: return '/' + self.local(value).relative_to(remote_root.resolve()).as_posix().replace('.', '', 1) if value == '.' else '/' + self.local(value).relative_to(remote_root.resolve()).as_posix()
        except OSError: return '/'
    def list_folder(self, value):
        try:
            result = []
            for item in self.local(value).iterdir():
                stat = paramiko.SFTPAttributes.from_stat(item.lstat()); stat.filename = item.name; result.append(stat)
            return result
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def stat(self, value):
        try: return paramiko.SFTPAttributes.from_stat(self.local(value).stat())
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    lstat = stat
    def open(self, value, flags, attr):
        try:
            fd = os.open(self.local(value), flags, 0o600)
            stream = os.fdopen(fd, 'r+b' if flags & os.O_RDWR else 'wb' if flags & os.O_WRONLY else 'rb')
            handle = SlowHandle(flags) if value.endswith("large.bin") else FileHandle(flags)
            handle.path = self.local(value)
            if not flags & os.O_WRONLY: handle.readfile = stream
            if flags & (os.O_RDWR | os.O_WRONLY): handle.writefile = stream
            return handle
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def mkdir(self, value, attr):
        try: self.local(value).mkdir(mode=0o700); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def rmdir(self, value):
        try: self.local(value).rmdir(); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def remove(self, value):
        try: self.local(value).unlink(); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def rename(self, source, target):
        try:
            if self.local(target).exists(): return paramiko.SFTP_FAILURE
            self.local(source).rename(self.local(target)); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)
    def posix_rename(self, source, target):
        try: os.replace(self.local(source), self.local(target)); return paramiko.SFTP_OK
        except OSError as e: return paramiko.SFTPServer.convert_errno(e.errno)

class Server(paramiko.ServerInterface):
    def __init__(self): self.ready = threading.Event(); self.channel = None; self.direct={}; self.listeners={}
    def get_allowed_auths(self, username): return 'password,publickey'
    def check_auth_password(self, username, password):
        event('password', username)
        return paramiko.AUTH_SUCCESSFUL if password == 'termix-test-password' else paramiko.AUTH_FAILED
    def check_auth_publickey(self, username, key):
        event('key', username)
        return paramiko.AUTH_SUCCESSFUL if key in (user_key, ed_user_key) else paramiko.AUTH_FAILED
    def check_channel_exec_request(self, channel, command):
        if command != b"uname -s" and b"TERMIX_MONITOR_V1" not in command: return False
        def metrics():
            channel.sendall(b"Linux\n" if command == b"uname -s" else b"TERMIX_MONITOR_V1\\ncpu 100 70\\nmem 2048 512\\ndisk 4096 1024\\nuptime 120\\nnet 1000 2000\\nssh 3\\nusers 2\\n".replace(b"\\n", b"\n"))
            channel.send_exit_status(0); channel.shutdown_write()
        threading.Thread(target=metrics, daemon=True).start()
        return True
    def check_channel_direct_tcpip_request(self, chanid, origin, destination):
        if destination[0] not in ("127.0.0.1", "::1"): return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
        self.direct[chanid]=destination
        return paramiko.OPEN_SUCCEEDED
    def check_port_forward_request(self, address, port):
        print("fixture forward request", repr(address), port, flush=True, file=sys.stderr)
        if address not in ("127.0.0.1", "::1"): return False
        listener=socket.socket(socket.AF_INET6 if address=="::1" else socket.AF_INET,socket.SOCK_STREAM)
        try: listener.bind((address,port)); listener.listen(8); listener.settimeout(.1)
        except OSError: listener.close(); return False
        bound=listener.getsockname()[1]; self.listeners[(address,bound)]=listener
        def accept():
            while self.transport.is_active() and (address,bound) in self.listeners:
                try:
                    peer,origin=listener.accept(); channel=self.transport.open_forwarded_tcpip_channel(origin,(address,bound))
                    threading.Thread(target=forward_pair,args=(peer,channel),daemon=True).start()
                except socket.timeout: continue
                except (OSError,paramiko.SSHException): break
            listener.close()
        threading.Thread(target=accept,daemon=True).start()
        return bound
    def cancel_port_forward_request(self,address,port):
        listener=self.listeners.pop((address,port),None)
        if listener: listener.close()
    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED if kind == 'session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
    def check_channel_pty_request(self, channel, term, width, height, pw, ph, modes): return True
    def check_channel_shell_request(self, channel): self.channel = channel; self.ready.set(); return True
    def check_channel_window_change_request(self, channel, width, height, pw, ph):
        channel.send(('\r\nsize:%d:%d\r\n' % (width, height)).encode()); return True

def forward_pair(tcp,channel):
    def copy(source,target):
        try:
            while True:
                data=source.recv(16384)
                if not data: break
                target.sendall(data)
        except (OSError,EOFError,paramiko.SSHException): pass
        finally:
            try:
                if isinstance(target,paramiko.Channel): target.shutdown_write()
                else: target.shutdown(socket.SHUT_WR)
            except (OSError,EOFError,paramiko.SSHException): pass
    a=threading.Thread(target=copy,args=(tcp,channel),daemon=True);b=threading.Thread(target=copy,args=(channel,tcp),daemon=True)
    a.start();b.start();a.join(20);b.join(20);tcp.close();channel.close()

def connection(sock):
    transport = paramiko.Transport(sock)
    transport.add_server_key(host_key)
    transport.set_subsystem_handler("sftp", paramiko.SFTPServer, Files)
    server = Server(); server.transport=transport
    try:
        transport.start_server(server=server)
        channel = transport.accept(20)
        if channel is None or not server.ready.wait(10): return
        def accept_extra():
            while transport.is_active():
                extra=transport.accept(.1)
                if extra is None: continue
                target=server.direct.pop(extra.get_id(),None)
                if target:
                    try: tcp=socket.create_connection(target,timeout=2);tcp.settimeout(None)
                    except OSError: extra.close();continue
                    threading.Thread(target=forward_pair,args=(tcp,extra),daemon=True).start()
        threading.Thread(target=accept_extra,daemon=True).start()
        channel.send('SSH fixture ready · ö\r\n> '.encode())
        pending = b''
        while transport.is_active():
            data = channel.recv(8192)
            if not data: break
            if b'\x03' in data: channel.send(b'^C\r\n> '); data = data.replace(b'\x03', b'')
            pending += data
            while b'\r' in pending or b'\n' in pending:
                pending = pending.replace(b'\r\n', b'\r').replace(b'\n', b'\r')
                line, pending = pending.split(b'\r', 1)
                if line == b'exit':
                    channel.send_exit_status(7)
                    channel.close()
                    # Channel close is not a TCP disconnect. Keep the SSH
                    # transport alive until the client drains status/CLOSE and
                    # closes its connection, as a normal multi-channel server does.
                    deadline = time.monotonic() + 5
                    while transport.is_active() and time.monotonic() < deadline: time.sleep(.01)
                    return
                channel.send(b'remote:' + line + b'\r\n> ')
    except (EOFError, OSError, paramiko.SSHException): pass
    finally: transport.close()

listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(('127.0.0.1', args.port)); listener.listen(16)
(root / 'ready').write_text('ready')
while True:
    client, _ = listener.accept()
    threading.Thread(target=connection, args=(client,), daemon=True).start()
