"""Create a source-only archive. Never include runtime data, env or symlinks."""
import hashlib
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else root.parent / "petra-platform-0.18.0-source.zip"
if output.exists() or output == root or root in output.parents:
    raise SystemExit("Choose a new archive path outside the repository")
subprocess.run(["node", "scripts/security-check.mjs", "--built"], cwd=root, check=True)
ignored = {".git", ".data", "node_modules", ".next", "dist", "coverage", "playwright-report", "test-results", "__pycache__"}
files = []
sources = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode().split("\0")
for source in sorted(set(sources)):
    if not source:
        continue
    relative = Path(source)
    file = root / relative
    if any(part in ignored for part in relative.parts) or not file.is_file() or file.is_symlink():
        continue
    if any(part.startswith(".env") and part != ".env.example" for part in relative.parts):
        continue
    if file.name.endswith((".log", ".tsbuildinfo", ".pem", ".key", ".dump", ".sql.gz", ".bak", ".zip", ".sqlite")):
        continue
    files.append(file)
try:
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(files):
            archive.write(file, str(Path("pet") / file.relative_to(root)))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(f"{digest}  {output.name}\n")
    print(f"Packaged {len(files)} source files; runtime secrets/data excluded. SHA256: {digest}")
except BaseException:
    output.unlink(missing_ok=True)
    raise
