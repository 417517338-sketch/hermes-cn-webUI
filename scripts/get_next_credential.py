#!/usr/bin/env python3
"""
Get next available credential from the hermes credential pool for a given provider.
Used by direct.js (Node.js) to avoid hardcoding .env keys that may be exhausted.

Usage: python3 get_next_credential.py <provider> [provider ...]
Output: JSON { "token": "...", "base_url": "...", "label": "..." } or empty on failure
"""
import sys
import json
import os

# Add hermes-agent to path (~/.hermes/hermes-agent)
HERMES_HOME = os.path.expanduser('~/.hermes')
AGENT_DIR = os.path.join(HERMES_HOME, 'hermes-agent')
sys.path.insert(0, AGENT_DIR)

try:
    from agent.credential_pool import load_pool
except ImportError:
    print(json.dumps({}))
    sys.exit(0)


def get_next_credential(provider: str) -> dict:
    try:
        pool = load_pool(provider.strip().lower())
        cred = pool.peek()
        if cred is None:
            return {}
        return {
            "token": cred.access_token,
            "base_url": cred.base_url or "",
            "label": cred.label,
        }
    except Exception:
        return {}


def main():
    providers = sys.argv[1:] if len(sys.argv) > 1 else ["minimax-cn"]
    result = {}
    for p in providers:
        result[p] = get_next_credential(p)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
