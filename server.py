from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen
import json
import os


ROOT = Path(__file__).resolve().parent
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "7860"))
DBLP_SEARCH = "https://dblp.org/search/publ/api"
USER_AGENT = "dblp-bibtex-tool/1.0"


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/search":
            self.handle_search(parsed.query)
            return
        if parsed.path == "/api/bib":
            self.handle_bib(parsed.query)
            return
        super().do_GET()

    def handle_search(self, query_string):
        params = parse_qs(query_string)
        query = params.get("q", [""])[0].strip()
        limit = params.get("h", ["20"])[0]

        if not query:
            self.send_json({"error": "missing query"}, status=400)
            return

        target = f"{DBLP_SEARCH}?q={quote(query)}&h={quote(limit)}&format=json"
        try:
            payload = self.fetch_text(target)
            self.send_json(json.loads(payload))
        except (HTTPError, URLError, TimeoutError) as exc:
            self.send_json({"error": f"search upstream failed: {exc}"}, status=502)
        except json.JSONDecodeError:
            self.send_json({"error": "search response is not valid json"}, status=502)

    def handle_bib(self, query_string):
        params = parse_qs(query_string)
        bib_url = params.get("url", [""])[0].strip()
        key = params.get("key", [""])[0].strip()

        if bib_url:
            target = unquote(bib_url)
        elif key:
            target = f"https://dblp.org/rec/{quote(key)}.bib"
        else:
            self.send_json({"error": "missing url or key"}, status=400)
            return

        try:
            payload = self.fetch_text(target)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload.encode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            self.send_json({"error": f"bib upstream failed: {exc}"}, status=502)

    def fetch_text(self, url):
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=15) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    server.serve_forever()
