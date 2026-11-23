"""The test-wide network block refuses remote hosts and allows only local ones."""

import socket

import pytest


def test_remote_connection_is_refused() -> None:
    with pytest.raises(OSError, match="must not open network connections"):
        socket.create_connection(("192.0.2.10", 443), timeout=1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(OSError, match="must not open network connections"):
            sock.connect(("203.0.113.5", 443))
    finally:
        sock.close()


def test_loopback_is_not_refused_by_the_block() -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    try:
        client = socket.create_connection(server.getsockname(), timeout=1)
        client.close()
    finally:
        server.close()
