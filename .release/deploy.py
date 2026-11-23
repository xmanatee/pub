#!/usr/bin/env python3
"""Run the shared release publisher pinned by commit and checksum."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import urllib.request

REF = "762022752e2f79c894fe98a03fea350fe22f1c0d"
SHA256 = "8fedb9e4ca31adc5e86c661340fd16c6f5f894baca22c54b0be967bd717b02d6"
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
