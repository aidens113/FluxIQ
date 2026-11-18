import base64
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("fetch_config", Path(__file__).resolve().parents[1] / "fetch-config.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FetchTests(unittest.TestCase):
    def test_aws_uses_vm_identity_and_exact_secret_without_secret_values_in_argv(self):
        config = {"provider": "aws", "region": "us-west-2", "config_secret": "arn:aws:secretsmanager:us-west-2:123456789012:secret:fixture"}
        with patch.object(module.subprocess, "run", return_value=SimpleNamespace(stdout=b"fixture-config")) as run:
            self.assertEqual(module.fetch_config(config), b"fixture-config")
            arguments, options = run.call_args
            self.assertIn(config["config_secret"], arguments[0])
            self.assertNotIn("fixture-config", arguments[0])
            self.assertEqual(options["stderr"], module.subprocess.DEVNULL)
            self.assertEqual(options["env"]["AWS_EC2_METADATA_V1_DISABLED"], "true")
            self.assertTrue(options["check"])

    def test_gcp_scopes_read_to_exact_version_and_retains_token_in_memory(self):
        config = {"provider": "gcp", "config_secret": "projects/fixture/secrets/runtime/versions/1"}
        responses = [{"access_token": "fixture-access-token"}, {"payload": {"data": base64.b64encode(b"fixture-config").decode()}}]
        with patch.object(module, "request_json", side_effect=responses) as request:
            self.assertEqual(module.fetch_config(config), b"fixture-config")
            metadata, secret = request.call_args_list
            self.assertEqual(metadata.args[1], {"Metadata-Flavor": "Google"})
            self.assertEqual(secret.args[0], "https://secretmanager.googleapis.com/v1/" + config["config_secret"] + ":access")
            self.assertNotIn("fixture-access-token", secret.args[0])

    def test_azure_selects_assigned_identity_and_key_vault_audience(self):
        config = {"provider": "azure", "identity_client_id": "fixture-client-id", "config_secret": "https://fixture.vault.azure.net/secrets/runtime/" + "a" * 32}
        with patch.object(module, "request_json", side_effect=[{"access_token": "fixture-token"}, {"value": "fixture-config"}]) as request:
            self.assertEqual(module.fetch_config(config), b"fixture-config")
            metadata, secret = request.call_args_list
            self.assertIn("client_id=fixture-client-id", metadata.args[0])
            self.assertIn("resource=https%3A%2F%2Fvault.azure.net", metadata.args[0])
            self.assertEqual(secret.args[1]["Authorization"], "Bearer fixture-token")
            self.assertNotIn("fixture-token", secret.args[0])

    def test_provider_credentials_never_follow_a_redirect(self):
        self.assertIsNone(module.NoRedirects().redirect_request(None, None, 302, "fixture", {}, "https://other.example.org"))
        with self.assertRaises(ValueError):
            module.fetch_config({"provider": "unsupported"})


if __name__ == "__main__":
    unittest.main()
