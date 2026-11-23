"""Prepare student code before it leaves the machine.

Comments are replaced by spaces (line breaks kept, so every line keeps its number), then
strings that look like a student ID (8 digits) or an email address are masked.
"""

from __future__ import annotations

import re

import tree_sitter_cpp
from tree_sitter import Language, Parser

_PARSER = Parser(Language(tree_sitter_cpp.language()))
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_STUDENT_ID = re.compile(r"(?<!\d)\d{8}(?!\d)")


def strip_comments(source: str) -> str:
    data = bytearray(source.encode("utf-8"))
    stack = [_PARSER.parse(bytes(data)).root_node]
    while stack:
        node = stack.pop()
        if node.type == "comment":
            for i in range(node.start_byte, node.end_byte):
                if data[i] not in (0x0A, 0x0D):
                    data[i] = 0x20
            continue
        stack.extend(node.children)
    return data.decode("utf-8", errors="replace")


def mask_identity(text: str) -> str:
    return _STUDENT_ID.sub("[MSSV]", _EMAIL.sub("[EMAIL]", text))


def sanitize(source: str) -> str:
    """Comment-free, identity-masked code with the same line numbers as ``source``.

    Trailing whitespace (including what a removed comment leaves) is dropped from each line.
    """
    clean = mask_identity(strip_comments(source))
    return "\n".join(line.rstrip() for line in clean.split("\n"))
