"""Extract only the five expected regular release files, never archive paths or links."""
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile


def extract_release(archive_path, destination):
    with tarfile.open(archive_path, "r:gz") as archive:
        files = {}
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or "\\" in member.name:
                raise ValueError("Unsafe archive path")
            name = str(path)
            if member.isdir():
                if name not in (".", "deploy", "deploy/compose", "deploy/caddy"):
                    raise ValueError("Unexpected archive directory")
                continue
            if not member.isfile() or name in files:
                raise ValueError("Archive links, special files and duplicates are refused")
            files[name] = member
        if "manifest.json" not in files:
            raise ValueError("Missing release manifest")
        manifest = json.load(archive.extractfile(files["manifest.json"]))
        if (type(manifest.get("schema")) is not int or manifest.get("schema") != 1
                or manifest.get("profile") not in ("self-hosted", "service") or manifest.get("platform") != "linux/amd64"):
            raise ValueError("Unsupported release contract")
        for key in ("coreImage", "caddyImage"):
            if not re.fullmatch(r"[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}", manifest.get(key, "")):
                raise ValueError("Release image is not pinned")
        expected = {"manifest.json", "launch.sh", "cloud.compose.json", "deploy/caddy/Caddyfile.example",
                    "deploy/compose/" + manifest["profile"] + ".compose.yml"}
        if set(files) != expected:
            raise ValueError("Unexpected or missing release file")
        # Destination must be fresh, and links are never created or followed.
        destination = Path(destination)
        destination.mkdir(mode=0o700)
        for name, member in files.items():
            path = destination / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with path.open("xb") as handle, archive.extractfile(member) as source:
                while data := source.read(65536):
                    handle.write(data)
            path.chmod(0o600)
        return manifest


if __name__ == "__main__":
    try:
        extract_release(sys.argv[1], sys.argv[2])
    except Exception:
        sys.stderr.write("FluxIQ release archive is invalid or could not be extracted safely.\n")
        sys.exit(1)
