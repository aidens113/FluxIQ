import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SUBJECT = Path(__file__).resolve().parents[1] / "write-config.py"
spec = importlib.util.spec_from_file_location("write_config", SUBJECT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def payload():
    return {
        "schema": 1,
        "environment": {
            "FLUXIQ_PUBLIC_ORIGIN": "https://app.example.org",
            "FLUXIQ_SITE_ADDRESS": "app.example.org",
            "ACME_EMAIL": "operator@example.org",
            "FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS": "chrome-extension://" + "a" * 32 + ",moz-extension://*",
            "FLUXIQ_INSTANCE_ID": "test-instance-1",
        },
        "secrets": {"provisioning-token": "fixture-token-" + "0123456789" * 4,
                    "setup-code": "fixture-setup-code-0123456789"},
    }


class ConfigurationTests(unittest.TestCase):
    def test_private_files_keep_secrets_out_of_environment(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "configuration"
            value = payload()
            module.write_config(value, "service", target)
            self.assertEqual((target / "secrets/provisioning-token").read_text(), value["secrets"]["provisioning-token"])
            self.assertEqual(json.loads((target / "environment.json").read_text()), value["environment"])
            self.assertNotIn(value["secrets"]["provisioning-token"], (target / "runtime.env").read_text())
            self.assertIn("FLUXIQ_PUBLIC_ORIGIN='https://app.example.org'", (target / "runtime.env").read_text())
            if os.name != "nt":
                self.assertEqual((target.stat().st_mode & 0o777), 0o700)
                self.assertEqual(((target / "runtime.env").stat().st_mode & 0o777), 0o600)
                self.assertEqual(((target / "secrets/setup-code").stat().st_mode & 0o777), 0o400)

    def test_invalid_configuration_never_writes_any_files(self):
        cases = [
            ("FLUXIQ_PUBLIC_ORIGIN", "http://app.example.org"),
            ("FLUXIQ_PUBLIC_ORIGIN", "https://credential-leak@app.example.org"),
            ("FLUXIQ_PUBLIC_ORIGIN", "https://app.example.org/path"),
            ("FLUXIQ_SITE_ADDRESS", "other.example.org"),
            ("FLUXIQ_SITE_ADDRESS", "app.example.org { respond injected }"),
            ("FLUXIQ_INSTANCE_ID", "$(credential-leak)"),
            ("FLUXIQ_EMAIL_API_KEY", "credential-leak"),
            ("FLUXIQ_PROFILE", "local"),
            ("FLUXIQ_ROOT", "/tmp"),
            ("ACME_EMAIL", "operator@example.org { injected }"),
            ("FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS", "chrome-extension://<replace>"),
            ("FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS", "https://*"),
            ("FLUXIQ_INSTANCE_NAME", "name\nINJECTED=value"),
        ]
        with tempfile.TemporaryDirectory() as temp:
            for key, value in cases:
                with self.subTest(key=key, value=value):
                    candidate = payload()
                    candidate["environment"][key] = value
                    target = Path(temp) / "must-not-exist"
                    with self.assertRaises(ValueError) as error:
                        module.write_config(candidate, "service", target)
                    self.assertNotIn("credential-leak", str(error.exception))
                    self.assertFalse(target.exists())

    def test_invalid_secret_and_profile_shapes_are_rejected(self):
        cases = []
        for change in [
            {"provisioning-token": "short"}, {"setup-code": "short"},
            {"unknown-secret": "fixture-value"}, {"email-api-key": "bad\x00value"},
        ]:
            candidate = payload()
            candidate["secrets"].update(change)
            cases.append(candidate)
        cases.extend([{**payload(), "schema": 2}, {**payload(), "schema": True}, {**payload(), "extra": "fixture"}])
        with tempfile.TemporaryDirectory() as temp:
            for candidate in cases:
                with self.assertRaises(ValueError):
                    module.write_config(candidate, "service", Path(temp) / "absent")
            with self.assertRaises(ValueError):
                module.write_config(payload(), "local", Path(temp) / "absent")

    def test_email_file_and_self_hosted_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            candidate = payload()
            candidate["environment"].update({"FLUXIQ_EMAIL_SENDER": "resend", "FLUXIQ_EMAIL_FROM": "FluxIQ <accounts@example.org>"})
            with self.assertRaises(ValueError):
                module.write_config(candidate, "service", Path(temp) / "missing-mail-key")
            candidate["secrets"]["email-api-key"] = "fixture-email-key"
            module.write_config(candidate, "service", Path(temp) / "resend")
            self_hosted = copy.deepcopy(candidate)
            self_hosted["secrets"] = {"email-api-key": "fixture-email-key"}
            module.write_config(self_hosted, "self-hosted", Path(temp) / "self-hosted")
            with self.assertRaises(ValueError):
                module.write_config(candidate, "self-hosted", Path(temp) / "bad-self-hosted")

    def test_command_errors_never_print_payload_or_traceback(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "bad.json"
            path.write_text('{"secret":"credential-leak",INVALID', encoding="utf-8")
            result = subprocess.run([sys.executable, str(SUBJECT), str(path), "service"], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b"")
            self.assertNotIn(b"credential-leak", result.stderr)
            self.assertNotIn(b"Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
