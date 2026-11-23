"""Trusted container entry point. The submitted program only inherits its stdio."""

import ctypes
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


CGROUP = Path("/sys/fs/cgroup")
PROGRAM = "/work/program"
CPU, WALL, MEMORY, PROGRAM_ERROR, INFRASTRUCTURE = 10, 11, 12, 13, 125


def counter(file: str, key: str) -> int:
    with (CGROUP / file).open(encoding="ascii") as stats:
        for line in stats:
            name, value = line.split()
            if name == key:
                return int(value)
    raise OSError(f"Missing cgroup counter: {key}")


def execute(command: list[str], env: dict[str, str], cpu_ms: int, wall_ms: int) -> int:
    if (CGROUP / "memory.swap.max").read_text(encoding="ascii").strip() != "0":
        return INFRASTRUCTURE
    # Only the ancestor PID namespace can forcibly signal this namespace's PID 1.
    # Also deny the child access to the supervisor through ptrace or /proc/1/fd.
    if ctypes.CDLL(None).prctl(4, 0, 0, 0, 0) != 0:  # PR_SET_DUMPABLE
        return INFRASTRUCTURE
    signal.signal(signal.SIGINT, signal.SIG_IGN)

    start_cpu = counter("cpu.stat", "usage_usec")
    start_oom = counter("memory.events", "oom_kill")
    deadline = time.monotonic() + wall_ms / 1000
    child = subprocess.Popen(command, env=env)
    while True:
        exit_code = child.poll()
        if counter("memory.events", "oom_kill") > start_oom:
            return MEMORY
        if counter("cpu.stat", "usage_usec") - start_cpu >= cpu_ms * 1000:
            return CPU
        if time.monotonic() >= deadline:
            return WALL
        if exit_code is not None:
            return 0 if exit_code == 0 else PROGRAM_ERROR
        time.sleep(0.015)


def stage_file(path: str, length: int) -> None:
    with open(path, "wb") as destination:
        while length:
            chunk = os.read(0, min(length, 65536))
            if not chunk:
                raise OSError("Incomplete sandbox input")
            destination.write(chunk)
            length -= len(chunk)


def main() -> int:
    mode = sys.argv[1]
    if mode == "compile":
        stage_file("/work/Main.cpp", int(sys.argv[2]))
        result = execute(
            ["/usr/local/bin/g++", "-std=c++17", "-O2", "/work/Main.cpp", "-o", PROGRAM],
            {"PATH": "/usr/local/bin:/usr/bin:/bin", "TMPDIR": "/work"},
            10000,
            10000,
        )
        if result == 0:
            with open(PROGRAM, "rb") as binary:
                shutil.copyfileobj(binary, sys.stdout.buffer)
        return result

    if mode == "run":
        cpu_ms = int(sys.argv[2])
        stage_file(PROGRAM, int(sys.argv[3]))
        os.chmod(PROGRAM, 0o500)
        return execute([PROGRAM], {}, cpu_ms, 3 * cpu_ms)
    return INFRASTRUCTURE


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError):
        sys.exit(INFRASTRUCTURE)
