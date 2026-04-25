"""Secret-name and secret-content filters for file tools.

Two layers of defense:
  - is_blocked_basename: reject filenames that conventionally hold secrets,
    even when the extension is on the allowlist (e.g. credentials.json).
  - scan_content_for_secrets: reject content carrying high-confidence secret
    markers (private keys, cloud keys, common token prefixes). Conservative on
    purpose — false positives that block legitimate writes are worse UX than
    a missed exotic format.
"""

import fnmatch
import re

_BLOCKED_BASENAME_GLOBS = (
    ".env",
    ".env.*",
    "secrets.*",
    "credentials.*",
    "service-account*.json",
    "*-credentials.json",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.ppk",
    "*.kdb",
    "*.kdbx",
    "id_rsa*",
    "id_dsa*",
    "id_ecdsa*",
    "id_ed25519*",
)

_BASENAME_ALLOWLIST = (".env.example", ".env.sample", ".env.template")

_SECRET_PATTERNS = (
    ("OpenSSH/PEM private key", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")),
    ("AWS access key id",       re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token",             re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}")),
    ("GitHub PAT",              re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("API key (sk- prefix)",    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("JWT-shaped token",        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("Google API key",          re.compile(r"\bAIza[0-9A-Za-z_-]{35,}")),
)

# Cap content scans so a multi-megabyte file doesn't make the filter the
# bottleneck. Real secrets virtually always sit in the first 64 KB.
_SCAN_BYTE_LIMIT = 64 * 1024


def is_blocked_basename(rel_path: str):
    """Return a reason string if the basename matches a secret convention, else None."""
    # Use posix-style splitting so backslashes don't hide the basename on Windows.
    basename = rel_path.replace("\\", "/").rsplit("/", 1)[-1].lower()
    if basename in _BASENAME_ALLOWLIST:
        return None
    for pattern in _BLOCKED_BASENAME_GLOBS:
        if fnmatch.fnmatchcase(basename, pattern):
            return f"filename matches secret convention '{pattern}'"
    return None


def scan_content_for_secrets(content: str):
    """Return a description of the first secret marker found, else None."""
    sample = content[:_SCAN_BYTE_LIMIT] if len(content) > _SCAN_BYTE_LIMIT else content
    for label, pattern in _SECRET_PATTERNS:
        if pattern.search(sample):
            return label
    return None
