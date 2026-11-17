"""Fetch one configured secret using VM identity; stdout is redirected to a private tmpfs file."""
import base64
import json
import os
import subprocess
import sys
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler, Request


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, headers):
    # Metadata must never traverse operator proxy settings; credentials never follow redirects.
    opener = build_opener(ProxyHandler({}), NoRedirects())
    with opener.open(Request(url, headers=headers), timeout=30) as response:
        return json.load(response)


def fetch_config(config):
    provider = config["provider"]
    if provider == "aws":
        command = ["aws", "secretsmanager", "get-secret-value", "--region", config["region"],
                   "--secret-id", config["config_secret"], "--query", "SecretString", "--output", "text"]
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                env={**os.environ, "AWS_PAGER": "", "AWS_EC2_METADATA_V1_DISABLED": "true"})
        return result.stdout
    if provider == "gcp":
        token = request_json("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
                             {"Metadata-Flavor": "Google"})["access_token"]
        result = request_json("https://secretmanager.googleapis.com/v1/" + config["config_secret"] + ":access",
                              {"Authorization": "Bearer " + token})
        return base64.b64decode(result["payload"]["data"], validate=True)
    if provider == "azure":
        query = urlencode({"api-version": "2018-02-01", "resource": "https://vault.azure.net",
                           "client_id": config["identity_client_id"]})
        token = request_json("http://169.254.169.254/metadata/identity/oauth2/token?" + query,
                             {"Metadata": "true"})["access_token"]
        result = request_json(config["config_secret"] + "?api-version=2025-07-01",
                              {"Authorization": "Bearer " + token})
        return result["value"].encode("utf-8")
    raise ValueError("Unsupported provider")


if __name__ == "__main__":
    try:
        with open(sys.argv[1], encoding="utf-8") as handle:
            config = json.load(handle)
        sys.stdout.buffer.write(fetch_config(config))
    except Exception:
        sys.stderr.write("FluxIQ could not read its configured cloud secret. Check VM identity and secret access.\n")
        sys.exit(1)
