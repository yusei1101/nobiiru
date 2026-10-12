"""ヘンゲー横丁 開発サーバー。
毎回 no-cache ヘッダを返すので、スマホでリロードすれば必ず最新が出る
(python -m http.server だとキャッシュされて更新が反映されない問題の対策)。

ThreadingHTTPServer を使う(=リクエストごとにスレッド)。単一スレッドの
TCPServer だと、ブラウザが複数ファイルを並列取得したときに1本しかさばけず
ハングして「更新が反映されない/読み込めない」ことがあるため。
"""
import http.server
import json
import os
import socket
import urllib.error
import urllib.request

VOICEVOX = "http://127.0.0.1:50021"  # VOICEVOX エンジン(アプリを起動すると立ち上がる)

PORT = 8123
os.chdir(os.path.dirname(os.path.abspath(__file__)))  # このファイルのある funny app を配信


def lan_addresses():
    """このPCの(ループバック以外の)IPv4アドレス。スマホから開くURLを画面に出すため。"""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # 実際には送信しない。経路の決定だけ
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def proxy_voicevox(self, method):
        """/__vv/... を PC の VOICEVOX へ中継する。同じWi-Fiのスマホからも PC の VOICEVOX で声を作れる。"""
        path = self.path[len("/__vv"):] or "/"
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else (b"" if method == "POST" else None)
        req = urllib.request.Request(VOICEVOX + path, data=body, method=method)
        ct = self.headers.get("Content-Type")
        if ct:
            req.add_header("Content-Type", ct)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data, status, rct = r.read(), r.status, r.headers.get("Content-Type", "application/octet-stream")
        except urllib.error.HTTPError as e:
            data, status, rct = e.read(), e.code, "application/json"
        except Exception:
            data, status, rct = b'{"error":"voicevox not running"}', 502, "application/json"
        self.send_response(status)
        self.send_header("Content-Type", rct)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.startswith("/__vv"):
            return self.proxy_voicevox("POST")
        self.send_error(405)

    def do_GET(self):
        if self.path.startswith("/__vv"):
            return self.proxy_voicevox("GET")
        if self.path.startswith("/__lan"):
            body = json.dumps({"ips": lan_addresses(), "port": PORT}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # 静かに


httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler)
print(f"ヘンゲー横丁: http://0.0.0.0:{PORT}  (no-cache / threaded)")
httpd.serve_forever()
