"""Unit tests never use the network or a real key.

Every socket connection to a non-local address fails loudly; only Unix sockets and loopback
are allowed, which Testcontainers needs to reach the local Docker engine. The Gemini
variables of the developer's shell are removed so that no test can build a real client.
"""

import ipaddress
import socket
from typing import Any

import pytest

_original_connect = socket.socket.connect
_original_connect_ex = socket.socket.connect_ex
_original_create_connection = socket.create_connection


def _is_local(sock_family: int, address: Any) -> bool:
    if sock_family == getattr(socket, "AF_UNIX", -1):
        return True
    host = address[0] if isinstance(address, tuple) else address
    if host == "localhost":
        return True
    try:
        return bool(ipaddress.ip_address(host).is_loopback)
    except ValueError:
        return False


def _refuse(*args: object, **kwargs: object) -> object:
    raise OSError("unit tests must not open network connections")


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "GEMINI_RPM"):
        monkeypatch.delenv(name, raising=False)

    def connect(self: socket.socket, address: Any) -> None:
        if not _is_local(self.family, address):
            _refuse()
        _original_connect(self, address)

    def connect_ex(self: socket.socket, address: Any) -> int:
        if not _is_local(self.family, address):
            _refuse()
        return _original_connect_ex(self, address)

    def create_connection(address: Any, *args: Any, **kwargs: Any) -> socket.socket:
        if not _is_local(socket.AF_INET, address):
            _refuse()
        return _original_create_connection(address, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket.socket, "connect_ex", connect_ex)
    monkeypatch.setattr(socket, "create_connection", create_connection)
