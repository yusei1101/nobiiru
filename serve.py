"""ヘンゲー横丁 開発サーバー。
毎回 no-cache ヘッダを返すので、スマホでリロードすれば必ず最新が出る
(python -m http.server だとキャッシュされて更新が反映されない問題の対策)。

ThreadingHTTPServer を使う(=リクエストごとにスレッド)。単一スレッドの
TCPServer だと、ブラウザが複数ファイルを並列取得したときに1本しかさばけず
ハングして「更新が反映されない/読み込めない」ことがあるため。
"""
import http.server
import os

PORT = 8123
os.chdir(os.path.dirname(os.path.abspath(__file__)))  # このファイルのある funny app を配信


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
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
