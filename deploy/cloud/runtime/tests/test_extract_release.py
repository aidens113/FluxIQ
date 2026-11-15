import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("extract_release", Path(__file__).resolve().parents[1] / "extract-release.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MANIFEST = {"schema": 1, "release": "fixture", "profile": "service", "platform": "linux/amd64",
            "coreImage": "fluxiq-core@sha256:" + "0123456789abcdef" * 4,
            "caddyImage": "caddy@sha256:" + "abcdef0123456789" * 4}


def archive(path, extra=None, manifest=None):
    with tarfile.open(path, "w:gz") as handle:
        files = {"./manifest.json": json.dumps(manifest or MANIFEST), "./launch.sh": "fixture",
                 "./cloud.compose.json": "{}", "./deploy/caddy/Caddyfile.example": "fixture",
                 "./deploy/compose/service.compose.yml": "fixture"}
        for name, value in files.items():
            member = tarfile.TarInfo(name)
            data = value.encode()
            member.size = len(data)
            handle.addfile(member, io.BytesIO(data))
        if extra is not None:
            handle.addfile(extra, io.BytesIO(b""))


class ArchiveTests(unittest.TestCase):
    def test_extracts_only_expected_regular_files_and_requires_fresh_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            source, destination = Path(temp) / "release.tar.gz", Path(temp) / "release"
            archive(source)
            result = module.extract_release(source, destination)
            self.assertEqual(result["coreImage"], MANIFEST["coreImage"])
            self.assertEqual(len(list(destination.rglob("*.*"))), 5)
            with self.assertRaises(FileExistsError):
                module.extract_release(source, destination)

    def test_rejects_paths_links_special_files_duplicates_and_unexpected_entries_before_writing(self):
        members = [tarfile.TarInfo(name) for name in (
            "../escaped", "/absolute", "deploy/../../escaped", "deploy\\..\\escaped", "unexpected-file", "./manifest.json")]
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE):
            member = tarfile.TarInfo("./launch.sh")
            member.type, member.linkname = kind, "../../escaped"
            members.append(member)
        with tempfile.TemporaryDirectory() as temp:
            for index, member in enumerate(members):
                with self.subTest(name=member.name, kind=member.type):
                    source, destination = Path(temp) / f"{index}.tar.gz", Path(temp) / f"{index}"
                    archive(source, member)
                    with self.assertRaises(ValueError):
                        module.extract_release(source, destination)
                    self.assertFalse(destination.exists())
            self.assertFalse((Path(temp) / "escaped").exists())

    def test_refuses_mutable_images_and_unsupported_runtime_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            for change in ({"schema": 2}, {"schema": True}, {"platform": "linux/arm64"}, {"profile": "local"}, {"coreImage": "fluxiq:latest"}):
                source = Path(temp) / "bad.tar.gz"
                archive(source, manifest={**MANIFEST, **change})
                with self.assertRaises(ValueError):
                    module.extract_release(source, Path(temp) / "absent")


if __name__ == "__main__":
    unittest.main()
