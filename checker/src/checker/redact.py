"""Prepare student code before it leaves the machine.

Comments are replaced by spaces (line breaks kept, so every line keeps its number). Inside
string and character literals only, text that looks like a student ID (8 digits) or an email
address is masked; numeric constants in the code are left as they are.
"""

from __future__ import annotations

import re

import tree_sitter_cpp
from tree_sitter import Language, Node, Parser

_PARSER = Parser(Language(tree_sitter_cpp.language()))
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_STUDENT_ID = re.compile(r"(?<!\d)\d{8}(?!\d)")
_LITERALS = frozenset({"string_literal", "raw_string_literal", "char_literal"})


def mask_identity(text: str) -> str:
    return _STUDENT_ID.sub("[MSSV]", _EMAIL.sub("[EMAIL]", text))


def _nodes(root: Node) -> list[Node]:
    """Comment and literal nodes, outermost only, in source order."""
    found: list[Node] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type == "comment" or node.type in _LITERALS:
            found.append(node)
            continue
        stack.extend(reversed(node.children))
    return found


def sanitize(source: str) -> str:
    """Comment-free code with identities masked in literals and the same line numbers.

    Trailing whitespace (including what a removed comment leaves) is dropped from each line.
    """
    data = source.encode("utf-8")
    parts: list[str] = []
    cursor = 0
    for node in _nodes(_PARSER.parse(data).root_node):
        parts.append(data[cursor : node.start_byte].decode("utf-8", errors="replace"))
        chunk = data[node.start_byte : node.end_byte].decode("utf-8", errors="replace")
        if node.type == "comment":
            parts.append("".join(c if c in "\r\n" else " " for c in chunk))
        else:
            parts.append(mask_identity(chunk))
        cursor = node.end_byte
    parts.append(data[cursor:].decode("utf-8", errors="replace"))
    return "\n".join(line.rstrip() for line in "".join(parts).split("\n"))
