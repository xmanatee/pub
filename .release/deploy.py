#!/usr/bin/env python3
"""Run the shared release publisher pinned by commit and checksum."""
import base64
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

REF = "d05eb5ecd80f75f31cb2c3af4aff939cd1e79b05"
SHA256 = "11ee2bad6d2b0579d3a341cd7dfb47b33c9590d3ce6bb3c3810301c0b1482b96"
root = Path(__file__).resolve().parent.parent
cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "app-releases" / "publishers" / REF
cache.mkdir(parents=True, exist_ok=True)
target = cache / "release.py"
if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != SHA256:
    encoded = subprocess.check_output(["gh", "api", "repos/xmanatee/workflows/contents/release.py?ref=" + REF, "--jq", ".content"])
    source = base64.b64decode(encoded)
    if hashlib.sha256(source).hexdigest() != SHA256:
        sys.exit("Publisher checksum mismatch")
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
        temporary.write(source)
    os.replace(temporary.name, target)
os.execv(sys.executable, [sys.executable, str(target), "--root", str(root), *sys.argv[1:]])
