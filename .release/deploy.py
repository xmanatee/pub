#!/usr/bin/env python3
"""Run the shared release publisher pinned by commit and checksum."""
import base64
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

REF = "c45f6aca7e8b0f2c7cf4e22fcf59bfe1290f8e0a"
SHA256 = "46331c741064b6b12c0d7ce09baa5f5fcdb2e4198bfd2247564c8ac7814385f3"
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
