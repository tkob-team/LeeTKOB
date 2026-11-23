"""Unit tests never use the network or a real key.

Every socket connection fails loudly, and the Gemini variables of the developer's shell are
removed so that no test can build a real client.
"""

import socket

import pytest


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "GEMINI_RPM"):
        monkeypatch.delenv(name, raising=False)

    def refuse(*args: object, **kwargs: object) -> object:
        raise OSError("unit tests must not open network connections")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
