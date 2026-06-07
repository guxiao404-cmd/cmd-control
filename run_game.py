#!/usr/bin/env python3
"""Run the Cmd Control browser game with only Python 3.

This starts a small static file server for the HTML, CSS and JavaScript files in
this repository. It is intended for phones or minimal environments that have
Python 3 but do not have Node.js/npm installed.
"""

from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5173


class GameRequestHandler(SimpleHTTPRequestHandler):
    """Static file handler with explicit web MIME types for module scripts."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def parse_args():
    parser = ArgumentParser(description="Run Cmd Control 暗黑三国 with Python 3.")
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help="Host to bind. Use 127.0.0.1 for this phone only, or 0.0.0.0 for LAN testing.",
    )
    parser.add_argument(
        "--port",
        default=DEFAULT_PORT,
        type=int,
        help="Port to serve the game on.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    handler = partial(GameRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    display_host = "localhost" if args.host in {"127.0.0.1", "0.0.0.0"} else args.host

    print("Cmd Control 暗黑三国 Python 3 server")
    print(f"Serving files from: {ROOT}")
    print(f"Open in your browser: http://{display_host}:{args.port}")
    print("Press Ctrl+C to stop.")

    server.serve_forever()


if __name__ == "__main__":
    main()
