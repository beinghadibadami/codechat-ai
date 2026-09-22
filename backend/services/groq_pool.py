"""
Groq API key pool with round-robin rotation + rate-limit cooldown.

Motivation:
    A single free-tier Groq key hits daily / per-minute limits fast under
    load. By pooling multiple keys (from different Groq accounts), we can
    tolerate one key being rate-limited and keep serving requests.

Behavior:
    - Round-robin across keys for load distribution
    - On 429 (rate limit), that key is skipped for COOLDOWN_SECONDS
    - On 5xx (server error), retry with the next key
    - On 4xx (bad request), propagate immediately — retrying won't help

Fallback:
    If GROQ_API_KEYS is not set, falls back to a single GROQ_API key so
    existing deployments keep working.
"""
import os
import time
from itertools import cycle
from typing import List, Optional

from groq import Groq
from groq import RateLimitError, APIError, APIStatusError


class GroqKeyPool:
    """Rotates through multiple Groq keys, skipping ones in cooldown."""

    COOLDOWN_SECONDS = 60  # skip a key for this long after a 429

    def __init__(self, keys: List[str]):
        keys = [k.strip() for k in keys if k and k.strip()]
        if not keys:
            raise ValueError("GroqKeyPool needs at least one API key")
        self.clients: List[Groq] = [Groq(api_key=k) for k in keys]
        self._cooldown_until: dict[int, float] = {}
        self._rotor = cycle(range(len(self.clients)))
        self._size = len(self.clients)

    @property
    def size(self) -> int:
        return self._size

    def _pick_index(self) -> int:
        """Pick the next available key index, skipping those in cooldown."""
        now = time.time()
        # Try every key once; if all in cooldown, pick the one closest to recovery
        for _ in range(self._size):
            idx = next(self._rotor)
            if self._cooldown_until.get(idx, 0.0) <= now:
                return idx
        # Everything is in cooldown — pick least-expired
        return min(range(self._size), key=lambda i: self._cooldown_until.get(i, 0.0))

    def create(self, **kwargs):
        """
        Call chat.completions.create with automatic key rotation.

        `stream=True` is supported — the returned generator is bound to a
        single key, so if a rate limit is hit mid-stream, that stream ends;
        the caller should treat the partial output like any other error.
        """
        last_error: Optional[Exception] = None
        for _ in range(self._size):
            idx = self._pick_index()
            client = self.clients[idx]
            try:
                return client.chat.completions.create(**kwargs)
            except RateLimitError as e:
                self._cooldown_until[idx] = time.time() + self.COOLDOWN_SECONDS
                last_error = e
                print(f"[groq_pool] key #{idx} rate-limited, cooling down 60s")
                continue
            except APIStatusError as e:
                # 5xx = transient, try next key. 4xx = don't retry.
                if 500 <= e.status_code < 600:
                    last_error = e
                    print(f"[groq_pool] key #{idx} got {e.status_code}, trying next")
                    continue
                raise
            except APIError as e:
                last_error = e
                continue
        # All keys exhausted
        if last_error:
            raise last_error
        raise RuntimeError("Groq pool exhausted with no error captured")


def build_pool_from_env() -> Optional[GroqKeyPool]:
    """
    Create a pool from env vars. Prefers GROQ_API_KEYS (comma-separated)
    and falls back to a single GROQ_API for backward compatibility.

    Returns None if no keys are configured (caller should handle gracefully).
    """
    multi = os.getenv("GROQ_API_KEYS", "")
    keys = [k for k in multi.split(",") if k.strip()]

    if not keys:
        single = os.getenv("GROQ_API", "")
        if single:
            keys = [single]

    if not keys:
        print("[WARN] No Groq API keys configured (set GROQ_API_KEYS or GROQ_API)")
        return None

    print(f"[groq_pool] initialized with {len(keys)} key(s)")
    return GroqKeyPool(keys)
