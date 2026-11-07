#!/usr/bin/env python3
"""Run the shared release publisher pinned by commit and checksum."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import urllib.request

REF = "ea8e5d6db6b7cd5638da30f3027a3783db9aedca"
SHA256 = "53859b4dc2600dce68e42b964e1255a9a265affc45601552a152c493ab959353"
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
