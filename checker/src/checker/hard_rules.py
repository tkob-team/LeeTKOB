"""Deterministic, syntax-aware rules for ban-list constraints.

A constraint whose text starts with "Do not use" or "Do not call" is a ban list, and every
string in backticks is a banned name. Such a constraint is decided here from the C++ syntax
tree (tree-sitter), never from a raw text search, so comments and string literals never
count. Every other constraint is semantic and is left to the model (``check`` returns None).
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Literal

import tree_sitter_cpp
from tree_sitter import Language, Node, Parser

Verdict = Literal["pass", "violation", "unsure"]

_BAN_PREFIXES = ("Do not use", "Do not call")
_BACKTICK = re.compile(r"`([^`]+)`")

# Banned keywords are matched as real statements or expressions, never as text.
_KEYWORD_NODES: dict[str, frozenset[str]] = {
    "for": frozenset({"for_statement", "for_range_loop"}),
    "while": frozenset({"while_statement"}),
    "do": frozenset({"do_statement"}),
    "goto": frozenset({"goto_statement"}),
    "switch": frozenset({"switch_statement"}),
    "break": frozenset({"break_statement"}),
    "continue": frozenset({"continue_statement"}),
    "new": frozenset({"new_expression"}),
    "delete": frozenset({"delete_expression"}),
}

# Ancestors that keep a declaration at namespace scope.
_TRANSPARENT = frozenset(
    {
        "translation_unit",
        "declaration_list",
        "declaration",
        "template_declaration",
        "linkage_specification",
        "preproc_if",
        "preproc_ifdef",
        "preproc_else",
        "preproc_elif",
        "preproc_elifdef",
    }
)

_DECLARATOR_WRAPPERS = frozenset(
    {
        "init_declarator",
        "pointer_declarator",
        "reference_declarator",
        "array_declarator",
        "function_declarator",
        "parenthesized_declarator",
        "attributed_declarator",
    }
)

_NAME_LEAVES = frozenset({"identifier", "type_identifier", "field_identifier"})

_PARSER = Parser(Language(tree_sitter_cpp.language()))


@dataclass(frozen=True)
class Evidence:
    """One 1-based source line and its original text."""

    line: int
    text: str


@dataclass(frozen=True)
class RuleResult:
    verdict: Verdict
    evidence: tuple[Evidence, ...]
    reason: str


def banned_names(constraint_text: str) -> list[str] | None:
    """Banned names of a ban-list constraint, or None for a semantic constraint."""
    if not constraint_text.lstrip().startswith(_BAN_PREFIXES):
        return None
    names = [name.strip() for name in _BACKTICK.findall(constraint_text)]
    return [name for name in names if name] or None


def check(source: str, constraint_text: str) -> RuleResult | None:
    """Decide a ban-list constraint for one C++ source, or return None if it is semantic."""
    names = banned_names(constraint_text)
    if names is None:
        return None
    lines = source.split("\n")
    tree = _PARSER.parse(source.encode("utf-8"))
    analysis = _Analysis(_Ban.from_names(names), tree.root_node)
    hits = analysis.run()
    if hits:
        evidence = tuple(
            Evidence(row + 1, lines[row].rstrip("\r")) for row in sorted(hits) if row < len(lines)
        )
        found = ", ".join(f"`{name}`" for name in sorted(analysis.found))
        return RuleResult("violation", evidence, f"uses banned {found}")
    if tree.root_node.has_error and not _errors_come_from_macros(tree.root_node, analysis.macros):
        return RuleResult("unsure", (), "the source could not be parsed")
    return RuleResult("pass", (), "no banned name is used")


@dataclass(frozen=True)
class _Ban:
    keywords: frozenset[str]
    qualified: tuple[tuple[str, ...], ...]  # e.g. ("std", "sort")
    bare: frozenset[str]  # names written without a namespace, e.g. "qsort", "rbegin"

    @staticmethod
    def from_names(names: list[str]) -> _Ban:
        keywords: set[str] = set()
        qualified: list[tuple[str, ...]] = []
        bare: set[str] = set()
        for raw in names:
            name = raw.removesuffix("()").removesuffix("[]").strip()
            parts = tuple(p for p in name.split("::") if p)
            if not parts:
                continue
            if len(parts) == 1 and parts[0] in _KEYWORD_NODES:
                keywords.add(parts[0])
            elif len(parts) == 1:
                bare.add(parts[0])
            else:
                qualified.append(parts)
        return _Ban(frozenset(keywords), tuple(qualified), frozenset(bare))


@dataclass
class _Analysis:
    ban: _Ban
    root: Node
    using_namespaces: set[str] = field(default_factory=set)
    using_decls: set[tuple[str, ...]] = field(default_factory=set)
    namespace_aliases: dict[str, tuple[str, ...]] = field(default_factory=dict)
    defined_anywhere: set[str] = field(default_factory=set)
    defined_in_namespace: dict[str, set[tuple[str, ...]]] = field(default_factory=dict)
    defined_in_class: set[str] = field(default_factory=set)
    macros: dict[str, Node] = field(default_factory=dict)
    tainted: set[str] = field(default_factory=set)  # aliases and macros of banned names
    found: set[str] = field(default_factory=set)
    goto_labels: set[str] = field(default_factory=set)

    def run(self) -> set[int]:
        self._collect(self.root)
        self._taint_aliases_and_macros()
        hits: set[int] = set()
        for node in _walk(self.root):
            if node.type in ("preproc_def", "preproc_function_def"):
                if _text(node.child_by_field_name("name")) in self.tainted:
                    hits.add(node.start_point.row)
                continue
            if self._is_violation(node, in_macro=False):
                hits.add(node.start_point.row)
        if self.goto_labels:
            for node in _walk(self.root):
                label = node.child_by_field_name("label")
                if node.type == "labeled_statement" and _text(label) in self.goto_labels:
                    hits.add(node.start_point.row)
        return hits

    # --- context: using directives, aliases, the student's own declarations ------------

    def _collect(self, root: Node) -> None:
        for node in _walk(root):
            kind = node.type
            if kind == "using_declaration":
                target = next((c for c in node.named_children), None)
                parts = self._qualified_parts(target) if target is not None else ()
                if any(c.type == "namespace" for c in node.children):
                    self.using_namespaces.add("::".join(parts))
                elif parts:
                    self.using_decls.add(parts)
            elif kind == "namespace_alias_definition":
                alias, *rest = node.named_children
                if rest:
                    self.namespace_aliases[_text(alias)] = self._qualified_parts(rest[-1])
            elif kind in ("preproc_def", "preproc_function_def"):
                name = _text(node.child_by_field_name("name"))
                self.macros[name] = node
                self._define(name, node)
            elif kind == "function_definition":
                self._define_declarator(node.child_by_field_name("declarator"), node)
            elif kind in ("declaration", "field_declaration", "type_definition"):
                for declarator in node.children_by_field_name("declarator"):
                    self._define_declarator(declarator, node)
            elif kind in (
                "parameter_declaration",
                "optional_parameter_declaration",
                "for_range_loop",
            ):
                self._define_declarator(node.child_by_field_name("declarator"), None)
            elif kind in (
                "class_specifier",
                "struct_specifier",
                "union_specifier",
                "enum_specifier",
                "namespace_definition",
                "alias_declaration",
                "type_parameter_declaration",
                "enumerator",
            ):
                name_node = node.child_by_field_name("name")
                if name_node is None and kind == "type_parameter_declaration":
                    name_node = next((c for c in node.named_children), None)
                if name_node is not None and (
                    kind not in ("class_specifier", "struct_specifier", "union_specifier")
                    or node.child_by_field_name("body") is not None
                ):
                    self._define(_text(name_node).split("::")[-1], node)
            elif kind == "goto_statement" and "goto" in self.ban.keywords:
                self.goto_labels.add(_text(node.child_by_field_name("label")))

    def _define_declarator(self, declarator: Node | None, owner: Node | None) -> None:
        while declarator is not None and declarator.type in _DECLARATOR_WRAPPERS:
            declarator = declarator.child_by_field_name("declarator")
        if declarator is None:
            return
        name = _text(declarator).split("::")[-1].strip()
        if declarator.type == "qualified_identifier" or owner is None:
            self.defined_anywhere.add(name)
        else:
            self._define(name, owner)

    def _define(self, name: str, owner: Node) -> None:
        scope: list[str] = []
        parent = owner.parent
        while parent is not None:
            if parent.type == "namespace_definition":
                scope.append(_text(parent.child_by_field_name("name")))
            elif parent.type == "field_declaration_list":
                self.defined_in_class.add(name)
                return
            elif parent.type not in _TRANSPARENT:
                self.defined_anywhere.add(name)
                return
            parent = parent.parent
        if not scope:
            self.defined_anywhere.add(name)
        else:
            self.defined_in_namespace.setdefault(name, set()).add(tuple(reversed(scope)))

    def _is_user_defined(self, name: str, use: Node) -> bool:
        if name in self.defined_anywhere:
            return True
        if name in self.defined_in_class and (
            use.type == "field_identifier" or _inside_member_code(use)
        ):
            return True
        scopes = self.defined_in_namespace.get(name)
        if not scopes:
            return False
        here = _enclosing_namespaces(use)
        return any(
            here[: len(scope)] == scope or "::".join(scope) in self.using_namespaces
            for scope in scopes
        )

    def _taint_aliases_and_macros(self) -> None:
        for node in _walk(self.root):
            if node.type in ("type_definition", "alias_declaration"):
                body = node.child_by_field_name("type")
                if body is not None and any(
                    self._is_violation(n, in_macro=False) for n in _walk(body)
                ):
                    if node.type == "alias_declaration":
                        self.tainted.add(_text(node.child_by_field_name("name")))
                    else:
                        for declarator in node.children_by_field_name("declarator"):
                            self.tainted.add(_text(declarator))
        bodies: dict[str, Node] = {}
        for name, macro in self.macros.items():
            value = macro.child_by_field_name("value")
            if value is not None:
                bodies[name] = _PARSER.parse(value.text or b"").root_node
        changed = True
        while changed:
            changed = False
            for name, body in bodies.items():
                if name not in self.tainted and any(
                    self._is_violation(n, in_macro=True) for n in _walk(body)
                ):
                    self.tainted.add(name)
                    changed = True

    # --- matching one node ----------------------------------------------------------------

    def _is_violation(self, node: Node, *, in_macro: bool) -> bool:
        kind = node.type
        for keyword in self.ban.keywords:
            nodes = _KEYWORD_NODES[keyword]
            # A macro body is a token list, not a statement: match the keyword token.
            if kind in nodes or (in_macro and kind == keyword and not node.is_named):
                self.found.add(keyword)
                return True
        if kind == "qualified_identifier":
            if node.parent is not None and node.parent.type == "qualified_identifier":
                return False
            if _is_declared_name(node) or _inside(node, "using_declaration"):
                return False
            return self._match_qualified(self._qualified_parts(node))
        if kind in _NAME_LEAVES:
            if node.parent is not None and node.parent.type in (
                "qualified_identifier",
                "using_declaration",
                "namespace_alias_definition",
            ):
                return False
            return self._match_unqualified(node, in_macro=in_macro)
        return False

    def _match_qualified(self, parts: tuple[str, ...]) -> bool:
        if not parts:
            return False
        if parts[0] in self.tainted:
            self.found.add(parts[0])
            return True
        for banned in self.ban.qualified:
            if parts[: len(banned)] == banned:
                self.found.add("::".join(banned))
                return True
            for cut in range(1, len(banned) - 1):
                prefix, rest = banned[:cut], banned[cut:]
                if parts[: len(rest)] == rest and "::".join(prefix) in self.using_namespaces:
                    self.found.add("::".join(banned))
                    return True
        if parts[-1] in self.ban.bare and parts[:-1] in ((), ("std",)):
            self.found.add(parts[-1])
            return True
        return False

    def _match_unqualified(self, node: Node, *, in_macro: bool) -> bool:
        name = _text(node)
        if name in self.tainted:
            self.found.add(name)
            return True
        member = node.type == "field_identifier"
        if member and node.parent is not None and node.parent.type != "field_expression":
            return False  # a declared field, not an access
        if self._is_user_defined(name, node):
            return False
        if name in self.ban.bare:
            self.found.add(name)
            return True
        if member:
            return False
        for banned in self.ban.qualified:
            if banned[-1] != name:
                continue
            visible = (
                "::".join(banned[:-1]) in self.using_namespaces
                or banned in self.using_decls
                or (not in_macro and len(banned) == 2 and banned[0] == "std" and _is_call(node))
            )
            if visible:
                self.found.add("::".join(banned))
                return True
        return False

    def _qualified_parts(self, node: Node | None) -> tuple[str, ...]:
        parts: list[str] = []
        current = node
        while current is not None:
            if current.type == "qualified_identifier":
                scope = current.child_by_field_name("scope")
                if scope is not None:
                    parts.append(_simple_name(scope))
                current = current.child_by_field_name("name")
            else:
                parts.append(_simple_name(current))
                current = None
        cleaned = tuple(seg.strip() for p in parts for seg in p.split("::") if seg.strip())
        if cleaned and cleaned[0] in self.namespace_aliases:
            cleaned = self.namespace_aliases[cleaned[0]] + cleaned[1:]
        return cleaned


def _errors_come_from_macros(root: Node, macros: dict[str, Node]) -> bool:
    """True when every parse error sits on a use of the student's own macro.

    ``LOOP(i, n) { ... }`` is valid after preprocessing but parses as a call with a missing
    ``;``. Such an error does not make the rest of the tree unreliable.
    """
    if not macros:
        return False
    for node in _walk(root):
        if not (node.is_missing or node.type == "ERROR"):
            continue
        nearby = [node]
        if node.prev_sibling is not None:
            nearby.append(node.prev_sibling)
        if not any(
            n.type == "identifier" and _text(n) in macros for near in nearby for n in _walk(near)
        ):
            return False
    return True


def _walk(root: Node) -> Iterator[Node]:
    stack = [root]
    while stack:
        node = stack.pop()
        yield node
        condition = node.child_by_field_name("condition")
        if node.type == "preproc_if" and _text(condition).strip() in ("0", "false"):
            # `#if 0` code is never compiled; only the #else/#elif branch is real.
            alternative = node.child_by_field_name("alternative")
            if alternative is not None:
                stack.append(alternative)
            continue
        stack.extend(reversed(node.children))


def _text(node: Node | None) -> str:
    if node is None or node.text is None:
        return ""
    return node.text.decode("utf-8", errors="replace")


def _simple_name(node: Node) -> str:
    if node.type in ("template_type", "template_function", "template_method"):
        return _text(node.child_by_field_name("name"))
    return _text(node)


def _inside(node: Node, kind: str) -> bool:
    parent = node.parent
    while parent is not None:
        if parent.type == kind:
            return True
        parent = parent.parent
    return False


def _is_declared_name(node: Node) -> bool:
    """True for ``my::sort`` in ``void my::sort(...) {...}``: a definition, not a use."""
    parent = node.parent
    return (
        parent is not None
        and parent.type == "function_declarator"
        and parent.child_by_field_name("declarator") == node
    )


def _is_call(node: Node) -> bool:
    target = node
    if target.parent is not None and target.parent.type == "template_function":
        target = target.parent
    parent = target.parent
    return (
        parent is not None
        and parent.type == "call_expression"
        and parent.child_by_field_name("function") == target
    )


def _inside_member_code(node: Node) -> bool:
    """True inside a class body or an out-of-line member function ``T C::f() {...}``."""
    parent = node.parent
    while parent is not None:
        if parent.type == "field_declaration_list":
            return True
        if parent.type == "function_definition":
            declarator = parent.child_by_field_name("declarator")
            while declarator is not None and declarator.type in _DECLARATOR_WRAPPERS:
                declarator = declarator.child_by_field_name("declarator")
            if declarator is not None and declarator.type == "qualified_identifier":
                return True
        parent = parent.parent
    return False


def _enclosing_namespaces(node: Node) -> tuple[str, ...]:
    scope: list[str] = []
    parent = node.parent
    while parent is not None:
        if parent.type == "namespace_definition":
            scope.append(_text(parent.child_by_field_name("name")))
        parent = parent.parent
    return tuple(reversed(scope))
