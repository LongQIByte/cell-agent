#!/usr/bin/env python3
"""Extract a pinned Linux Android SDK from Cirrus Labs' public OCI layers.

Fallback for networks where dl.google.com is unreachable. Downloads use public,
anonymous GHCR access and verify every layer against its SHA-256 digest.
Ubuntu and emulator files are not extracted. Requires Python 3.12+.
Source: https://github.com/cirruslabs/docker-images-android
Image: ghcr.io/cirruslabs/android-sdk:36-ndk, amd64 manifest
sha256:eba21147d4ca3860e020ef607e3072f188674227e3110eb1d5aeb659f9ce4140
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import tarfile
import time
import threading
import urllib.error
import urllib.request

TOOLS = Path(os.environ.get("CODEX_REMOTE_TOOL_CACHE", str(Path.home() / ".cache/codex-remote-tools")))
SDK = TOOLS / "android-sdk"
CACHE = TOOLS / "oci-layers"
REPO = "cirruslabs/android-sdk"
MANIFEST = "sha256:eba21147d4ca3860e020ef607e3072f188674227e3110eb1d5aeb659f9ce4140"
LAYERS = [
    "debb49cb0d5e90fa3574d5ffc8a79f216da114f56add80a2501af1299504803c",
    "821ff31b6cb45e39add7d4cdbaea2217451b407f64041ba864511e03ee3346ab",
    "88f22e0ef2be400163ab305fb87254aee225cd2693647456ccf1d3916ad700ed",
]
CACHE.mkdir(parents=True, exist_ok=True)
SDK.mkdir(parents=True, exist_ok=True)

def get_token():
    with urllib.request.urlopen(f"https://ghcr.io/token?scope=repository:{REPO}:pull", timeout=30) as response:
        return json.load(response)["token"]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def download(digest):
    path = CACHE / f"{digest}.tar.gz"
    if path.exists() and hashlib.file_digest(path.open("rb"), "sha256").hexdigest() == digest:
        print(f"Cached layer {digest[:12]}", flush=True)
        return path
    for attempt in range(3):
        try:
            request = urllib.request.Request(f"https://ghcr.io/v2/{REPO}/blobs/sha256:{digest}", headers={"Authorization": "Bearer " + get_token()})
            try:
                urllib.request.build_opener(NoRedirect).open(request, timeout=30)
                raise RuntimeError("Expected an HTTPS download redirect")
            except urllib.error.HTTPError as error:
                if error.code != 307:
                    raise
                location = error.headers["Location"]
            if not location.startswith("https://pkg-containers.githubusercontent.com/"):
                raise RuntimeError("Unexpected OCI download host")
            with urllib.request.urlopen(urllib.request.Request(location, headers={"Range": "bytes=0-0"}), timeout=30) as response:
                total = int(response.headers["Content-Range"].split("/")[-1])
            parts = CACHE / digest
            parts.mkdir(exist_ok=True)
            chunk_size = 1024 * 1024
            downloaded = 0
            report_at = time.monotonic()
            lock = threading.Lock()
            def fetch_part(index):
                nonlocal downloaded, report_at
                start = index * chunk_size
                end = min(total, start + chunk_size) - 1
                part = parts / str(index)
                if not part.exists() or part.stat().st_size != end - start + 1:
                    for part_attempt in range(4):
                        try:
                            req = urllib.request.Request(location, headers={"Range": f"bytes={start}-{end}"})
                            with urllib.request.urlopen(req, timeout=60) as response:
                                if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-{end}/"):
                                    raise RuntimeError("Server did not honor byte range")
                                data = response.read(end - start + 2)
                            if len(data) != end - start + 1:
                                raise RuntimeError("Incomplete byte range")
                            part.write_bytes(data)
                            break
                        except Exception:
                            if part_attempt == 3:
                                raise
                with lock:
                    downloaded += part.stat().st_size
                    if time.monotonic() - report_at >= 15:
                        print(f"SDK layer {digest[:12]}: {downloaded // 1048576} / {total // 1048576} MB", flush=True)
                        report_at = time.monotonic()
            workers = min(96, max(1, int(os.environ.get("CODEX_REMOTE_DOWNLOAD_WORKERS", "16"))))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(fetch_part, range((total + chunk_size - 1) // chunk_size)))
            partial = path.with_suffix(".partial")
            sha = hashlib.sha256()
            with partial.open("wb") as output:
                for index in range((total + chunk_size - 1) // chunk_size):
                    data = (parts / str(index)).read_bytes()
                    output.write(data)
                    sha.update(data)
            if sha.hexdigest() != digest:
                raise RuntimeError("OCI layer checksum mismatch")
            partial.replace(path)
            print(f"Verified layer {digest[:12]}", flush=True)
            return path
        except Exception as error:
            if attempt == 2:
                raise
            print(f"Retry layer {digest[:12]}: {type(error).__name__}", flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    paths = list(pool.map(download, LAYERS))
for path in paths:
    count = 0
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            prefix = "opt/android-sdk-linux/"
            name = member.name.removeprefix("./")
            if not name.startswith(prefix):
                continue
            member.name = name[len(prefix):]
            if not member.name or "/.wh." in member.name or member.name.startswith(".wh."):
                continue
            archive.extract(member, SDK, filter="data")
            count += 1
    print(f"Extracted {count} SDK entries from {path.name[:12]}", flush=True)
print(f"Android SDK 36 / build-tools 36.0.0 / NDK 27.3 ready at {SDK}", flush=True)
