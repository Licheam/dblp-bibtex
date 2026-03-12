from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen
import json
import os


ROOT = Path(__file__).resolve().parent
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "7860"))
DBLP_SEARCH = "https://dblp.org/search/publ/api"
DBLP_VENUE_SEARCH = "https://dblp.org/search/venue/api"
USER_AGENT = "dblp-bibtex-tool/1.0"
DBLP_PAGE_SIZE = 1000
DBLP_MAX_VENUE_RESULTS = 5000
YEAR_PATTERN = re.compile(r"(19\d{2}|20\d{2}|2100)$")


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/search":
            self.handle_search(parsed.query)
            return
        if parsed.path == "/api/venue":
            self.handle_venue(parsed.query)
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

    def handle_venue(self, query_string):
        params = parse_qs(query_string)
        raw_query = params.get("q", [""])[0].strip()
        if not raw_query:
            self.send_json({"error": "missing query"}, status=400)
            return

        venue, year = self.parse_venue_year(raw_query)
        if not venue:
            self.send_json({"error": "missing venue name"}, status=400)
            return

        try:
            # Phase 1: resolve venue candidates using official venue API.
            venue_candidates = self.resolve_venue_candidates_safe(venue)
            # Phase 2: query publications using the best venue term and year filter.
            collected = self.collect_publications_for_venue(venue, year, venue_candidates)
            self.send_json(
                {
                    "query": raw_query,
                    "venue": venue,
                    "year": year,
                    "count": len(collected),
                    "hit": collected,
                    "venue_candidates": venue_candidates[:5],
                }
            )
        except (HTTPError, URLError, TimeoutError) as exc:
            self.send_json({"error": f"venue upstream failed: {exc}"}, status=502)
        except json.JSONDecodeError:
            self.send_json({"error": "venue response is not valid json"}, status=502)

    def resolve_venue_candidates_safe(self, venue):
        try:
            return self.resolve_venue_candidates(venue)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return []

    def resolve_venue_candidates(self, venue):
        target = f"{DBLP_VENUE_SEARCH}?q={quote(venue)}&h=10&format=json"
        payload = json.loads(self.fetch_text(target))
        hits_obj = payload.get("result", {}).get("hits", {})
        raw_hits = hits_obj.get("hit", [])
        hits = raw_hits if isinstance(raw_hits, list) else [raw_hits] if raw_hits else []
        candidates = []
        seen = set()
        for hit in hits:
            info = hit.get("info", {})
            terms = [
                str(info.get("venue", "")).strip(),
                str(info.get("acronym", "")).strip(),
                str(info.get("name", "")).strip(),
                str(info.get("title", "")).strip(),
            ]
            for term in terms:
                if term and term.lower() not in seen:
                    seen.add(term.lower())
                    candidates.append(term)
        return candidates

    def collect_publications_for_venue(self, venue, year, venue_candidates):
        search_terms = [*venue_candidates, venue]
        query_term = search_terms[0] if search_terms else venue
        merged_query = f"{query_term} {year}".strip()
        venue_norm = venue.lower()
        candidate_norms = [v.lower() for v in search_terms if v]

        collected = []
        seen_keys = set()
        offset = 0
        total = None

        while len(collected) < DBLP_MAX_VENUE_RESULTS:
            batch_size = min(DBLP_PAGE_SIZE, DBLP_MAX_VENUE_RESULTS - len(collected))
            target = f"{DBLP_SEARCH}?q={quote(merged_query)}&h={batch_size}&f={offset}&format=json"
            payload = json.loads(self.fetch_text(target))
            hits_obj = payload.get("result", {}).get("hits", {})
            raw_hits = hits_obj.get("hit", [])
            hits = raw_hits if isinstance(raw_hits, list) else [raw_hits] if raw_hits else []

            if total is None:
                try:
                    total = int(hits_obj.get("@total", len(hits)))
                except (TypeError, ValueError):
                    total = len(hits)

            if not hits:
                break

            for hit in hits:
                info = hit.get("info", {})
                key = info.get("key") or info.get("url") or info.get("title")
                if key in seen_keys:
                    continue

                item_year = str(info.get("year", "")).strip()
                item_venue = str(info.get("venue", "")).strip().lower()
                if year and item_year != year:
                    continue
                if venue_norm and venue_norm not in item_venue:
                    if not any(term in item_venue for term in candidate_norms):
                        continue

                seen_keys.add(key)
                collected.append(hit)

            offset += len(hits)
            if offset >= total:
                break

        return collected

    def parse_venue_year(self, raw_query):
        parts = raw_query.rsplit(" ", 1)
        if len(parts) == 2 and YEAR_PATTERN.fullmatch(parts[1].strip()):
            return parts[0].strip(), parts[1].strip()
        return raw_query.strip(), ""

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
