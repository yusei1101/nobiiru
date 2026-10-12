"""ペタ拳: アナウンス音声を VOICEVOX で作って kakutou/voice/ に保存する(一度だけ実行すればよい)。

使い方:
  1. VOICEVOX アプリを起動しておく(エンジンが 127.0.0.1:50021 で動く)
  2. python kakutou/tools/make_announcer.py            # 既定の声(青山龍星 など)
     python kakutou/tools/make_announcer.py ずんだもん  # 声を指定(VOICEVOX のキャラ名)

できたファイルはゲームに同梱されるので、スマホでも VOICEVOX 無しで鳴る。
VOICEVOX の利用規約により、ゲーム内に「VOICEVOX:キャラ名」を表示する(manifest.json の credit を使う)。
"""
import json
import os
import sys
import urllib.parse
import urllib.request

ENGINE = "http://127.0.0.1:50021"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "voice")
PREFERRED = ["青山龍星", "玄野武宏", "剣崎雌雄", "白上虎太郎", "ずんだもん"]

LINES = {
    "title":   "ペタけん！",
    "vs":      "バトルスタート！",
    "round1":  "ラウンドワン！",
    "round2":  "ラウンドツー！",
    "round3":  "ラウンドスリー！",
    "round4":  "ラウンドフォー！",
    "round5":  "ラウンドファイブ！",
    "final":   "ファイナルラウンド！",
    "fight":   "ファイッ！",
    "ko":      "ケー、オー！",
    "timeup":  "タイムアップ！",
    "perfect": "パーフェクト！",
    "draw":    "ひきわけ！",
    "win":     "しょうり！",
}


def get(path):
    with urllib.request.urlopen(ENGINE + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def post(path, body=None, ctype=None):
    data = b"" if body is None else body
    req = urllib.request.Request(ENGINE + path, data=data, method="POST")
    if ctype:
        req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def pick_speaker(want):
    speakers = get("/speakers")
    names = [want] if want else PREFERRED
    for n in names:
        for sp in speakers:
            if sp["name"] == n:
                st = next((s for s in sp["styles"] if s["name"] == "ノーマル"), sp["styles"][0])
                return sp["name"], st["name"], st["id"]
    sp = speakers[0]
    return sp["name"], sp["styles"][0]["name"], sp["styles"][0]["id"]


def main():
    try:
        ver = get("/version")
    except Exception:
        print("VOICEVOX が起動していません。アプリを起動してから もう一度実行してください。")
        sys.exit(1)
    name, style, sid = pick_speaker(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"VOICEVOX {ver} / 声: {name}({style}) id={sid}")
    os.makedirs(OUT, exist_ok=True)
    files = {}
    for key, text in LINES.items():
        q = json.loads(post("/audio_query?" + urllib.parse.urlencode({"text": text, "speaker": sid})).decode("utf-8"))
        # ラウンド系は 次の「ファイッ」までに言い切れるよう少し速く(試合のテンポ優先)
        speed = 1.15 if key.startswith("round") or key in ("final", "vs", "timeup") else 1.0
        q.update(speedScale=speed, intonationScale=1.6, volumeScale=1.35, prePhonemeLength=0.05, postPhonemeLength=0.12)
        wav = post(f"/synthesis?speaker={sid}", json.dumps(q).encode("utf-8"), "application/json")
        fn = key + ".wav"
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(wav)
        files[key] = fn
        print(f"  {key:8s} {text}  ({len(wav)//1024} KB)")
    manifest = {"speaker": name, "style": style, "speakerId": sid, "credit": f"VOICEVOX:{name}", "files": files}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("できました →", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
