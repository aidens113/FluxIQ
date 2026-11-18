"""Validate a fetched configuration without logging it, then write private runtime files."""
import json
import base64
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ENVIRONMENT_KEYS = {
    "FLUXIQ_PUBLIC_ORIGIN", "FLUXIQ_SITE_ADDRESS", "ACME_EMAIL",
    "FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS", "FLUXIQ_INSTANCE_ID", "FLUXIQ_INSTANCE_NAME",
    "FLUXIQ_SIGN_UP_URL", "FLUXIQ_EMAIL_SENDER", "FLUXIQ_EMAIL_FROM", "FLUXIQ_PANEL_PRESET",
    "FLUXIQ_DRAIN_SECONDS", "FLUXIQ_LOG_FORMAT",
}


def write_config(payload, profile, directory, owner=None):
    if profile not in ("service", "self-hosted"):
        raise ValueError("Unsupported deployment profile")
    if (not isinstance(payload, dict) or set(payload) != {"schema", "environment", "secrets"}
            or type(payload["schema"]) is not int or payload["schema"] != 1):
        raise ValueError("Expected runtime configuration schema 1")
    environment, secrets = payload["environment"], payload["secrets"]
    if not isinstance(environment, dict) or not set(environment) <= ENVIRONMENT_KEYS:
        raise ValueError("Unknown environment setting; secrets and runtime overrides are not accepted here")
    for value in environment.values():
        if not isinstance(value, str) or any(char in value for char in "\r\n\x00'\\$"):
            raise ValueError("Environment setting contains unsupported characters")
    required = {"FLUXIQ_PUBLIC_ORIGIN", "FLUXIQ_SITE_ADDRESS", "ACME_EMAIL", "FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS", "FLUXIQ_INSTANCE_ID"}
    if any(not environment.get(key, "").strip() for key in required):
        raise ValueError("Required public deployment settings are missing")
    origin = urlsplit(environment["FLUXIQ_PUBLIC_ORIGIN"])
    hostname = environment["FLUXIQ_SITE_ADDRESS"]
    if (origin.scheme != "https" or not origin.hostname or origin.username or origin.password
            or origin.path or origin.query or origin.fragment or origin.port not in (None, 443)
            or origin.hostname != hostname
            or not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", hostname)):
        raise ValueError("Origin must be HTTPS and match the site host exactly")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", environment["FLUXIQ_INSTANCE_ID"]):
        raise ValueError("Instance identity must be a stable identifier")
    if not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", environment["ACME_EMAIL"]):
        raise ValueError("ACME email is invalid")
    for origin_value in environment["FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS"].split(","):
        if not re.fullmatch(r"chrome-extension://[a-p]{32}|moz-extension://\*|moz-extension://[a-zA-Z0-9-]+", origin_value.strip()):
            raise ValueError("Extension origin allowlist is invalid or still contains placeholders")
    if not isinstance(secrets, dict) or not set(secrets) <= {"provisioning-token", "setup-code", "email-api-key", "secret-keyring"}:
        raise ValueError("Unknown secret file")
    if any(not isinstance(value, str) or "\x00" in value for value in secrets.values()):
        raise ValueError("Secret values must be text without NUL")
    if profile == "service":
        try:
            keyring = json.loads(secrets.get("secret-keyring", ""))
            keys = keyring["keys"]
            if type(keyring["version"]) is not int or keyring["version"] != 1 or not isinstance(keys, dict) or not isinstance(keyring["currentKeyId"], str) or keyring["currentKeyId"] not in keys:
                raise ValueError()
            for key_id, value in keys.items():
                if not key_id or not isinstance(value, str) or len(base64.b64decode(value, validate=True)) != 32 or base64.b64encode(base64.b64decode(value, validate=True)).decode() != value:
                    raise ValueError()
        except Exception:
            raise ValueError("Service requires a valid versioned secret keyring") from None
        tokens = secrets.get("provisioning-token", "").splitlines()
        if not tokens or len(tokens) > 2 or any(len(token.encode()) < 32 for token in tokens):
            raise ValueError("Service requires one or two provisioning tokens of at least 32 bytes")
        if len(secrets.get("setup-code", "").strip()) < 16:
            raise ValueError("Service requires a setup code of at least 16 characters")
    elif set(secrets) - {"email-api-key"}:
        raise ValueError("Self-hosted uses Core's generated setup code and no provisioning listener")
    sender = environment.get("FLUXIQ_EMAIL_SENDER", "file")
    if sender not in ("file", "none", "resend"):
        raise ValueError("Unsupported email sender")
    if sender == "resend" and (not environment.get("FLUXIQ_EMAIL_FROM") or not secrets.get("email-api-key")):
        raise ValueError("Resend requires sender and email API key file")
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    secret_directory = directory / "secrets"
    secret_directory.mkdir(mode=0o700, exist_ok=True)
    os.chmod(secret_directory, 0o700)
    files = {
        directory / "runtime.env": "".join(f"{key}='{value}'\n" for key, value in sorted(environment.items())),
        directory / "environment.json": json.dumps(environment),
        **{secret_directory / name: secrets.get(name, "") for name in ("provisioning-token", "setup-code", "email-api-key", "secret-keyring")},
    }
    for path, content in files.items():
        temporary = path.with_suffix(".new")
        # Refuse symlinks even though only root may write the parent directory.
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            if path.parent == secret_directory:
                os.chmod(temporary, 0o400)
                if owner is not None:
                    os.chown(temporary, owner, owner)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        with open(sys.argv[1], encoding="utf-8") as handle:
            payload = json.load(handle)
        write_config(payload, sys.argv[2], "/etc/fluxiq", owner=1000)
    except Exception:
        # Error values/tracebacks can contain fetched credentials; never print them.
        sys.stderr.write("FluxIQ runtime configuration could not be validated or written.\n")
        sys.exit(1)
