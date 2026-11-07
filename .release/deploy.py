#!/usr/bin/env python3
"""Run the shared release publisher pinned by commit and checksum."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import urllib.request

REF = "5c407ada85f88398ad1a742861863f4feb2c4676"
SHA256 = "44c93924def4c231937ca05b2cd355789417852b84530ce85cc7245b07acdc94"
root = Path(__file__).resolve().parent.parent
cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "app-releases" / "publishers" / REF
cache.mkdir(parents=True, exist_ok=True)
target = cache / "release.py"
if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != SHA256:
    with urllib.request.urlopen("https://raw.githubusercontent.com/xmanatee/workflows/" + REF + "/release.py", timeout=60) as response:
        source = response.read()
    if hashlib.sha256(source).hexdigest() != SHA256:
        sys.exit("Publisher checksum mismatch")
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
        temporary.write(source)
    os.replace(temporary.name, target)
os.execv(sys.executable, [sys.executable, str(target), "--root", str(root), *sys.argv[1:]])
