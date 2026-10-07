"""Capture real test runner output for the summary parser's fixtures.

Runs a tiny passing and a tiny failing project per runner in a scratch
directory, merges stderr into stdout as `2>&1` does, and writes the results to
tests/fixtures/runner-output.ts. Runners missing from this machine are skipped
and listed. pytest runs through `uvx`, jest and vitest through `npx`, so those
need the network the first time.

    python3 scripts/capture_runner_output.py <scratch-dir>
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "runner-output.ts"

PASSING = "pass"
FAILING = "fail"

PROJECTS = {
    "bun": {
        "needs": "bun",
        "files": {
            PASSING: {"a.test.ts": 'import { test, expect } from "bun:test"\ntest("a", () => expect(1).toBe(1))\ntest("b", () => expect(2).toBe(2))\n'},
            FAILING: {"a.test.ts": 'import { test, expect } from "bun:test"\ntest("a", () => expect(1).toBe(1))\ntest("b", () => expect(0.1 + 0.2).toBe(0.3))\n'},
        },
        "command": ["bun", "test"],
    },
    "deno": {
        "needs": "deno",
        "files": {
            PASSING: {"a_test.ts": 'Deno.test("a", () => {})\nDeno.test("b", () => {})\n'},
            FAILING: {"a_test.ts": 'Deno.test("a", () => {})\nDeno.test("b", () => { throw new Error("boom") })\n'},
        },
        "command": ["deno", "test"],
    },
    "go": {
        "needs": "go",
        "files": {
            PASSING: {"go.mod": "module demo\n\ngo 1.22\n", "a_test.go": 'package demo\nimport "testing"\nfunc TestA(t *testing.T) {}\nfunc TestB(t *testing.T) {}\n'},
            FAILING: {"go.mod": "module demo\n\ngo 1.22\n", "a_test.go": 'package demo\nimport "testing"\nfunc TestA(t *testing.T) {}\nfunc TestB(t *testing.T) { t.Fatal("boom") }\n'},
        },
        "command": ["go", "test", "./..."],
    },
    "cargo": {
        "needs": "cargo",
        "files": {
            PASSING: {
                "Cargo.toml": '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n',
                "src/lib.rs": "#[cfg(test)]\nmod tests {\n    #[test]\n    fn a() { assert_eq!(1, 1); }\n    #[test]\n    fn b() { assert_eq!(2, 2); }\n}\n",
            },
            FAILING: {
                "Cargo.toml": '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n',
                "src/lib.rs": "#[cfg(test)]\nmod tests {\n    #[test]\n    fn a() { assert_eq!(1, 1); }\n    #[test]\n    fn b() { assert_eq!(0.1 + 0.2, 0.3); }\n}\n",
            },
        },
        "command": ["cargo", "test"],
    },
    "pytest": {
        "needs": "uvx",
        "files": {
            PASSING: {"test_a.py": "def test_a():\n    assert 1 == 1\n\ndef test_b():\n    assert 2 == 2\n"},
            FAILING: {"test_a.py": "def test_a():\n    assert 1 == 1\n\ndef test_b():\n    assert 0.1 + 0.2 == 0.3\n"},
        },
        "command": ["uvx", "--quiet", "pytest"],
    },
    "jest": {
        "needs": "npx",
        "files": {
            PASSING: {"package.json": '{"private": true}\n', "a.test.js": 'test("a", () => expect(1).toBe(1))\ntest("b", () => expect(2).toBe(2))\n'},
            FAILING: {"package.json": '{"private": true}\n', "a.test.js": 'test("a", () => expect(1).toBe(1))\ntest("b", () => expect(0.1 + 0.2).toBe(0.3))\n'},
        },
        "command": ["npx", "-y", "jest@29"],
    },
    "vitest": {
        "needs": "npx",
        "files": {
            PASSING: {"package.json": '{"private": true, "type": "module"}\n', "a.test.js": 'import { test, expect } from "vitest"\ntest("a", () => expect(1).toBe(1))\ntest("b", () => expect(2).toBe(2))\n'},
            FAILING: {"package.json": '{"private": true, "type": "module"}\n', "a.test.js": 'import { test, expect } from "vitest"\ntest("a", () => expect(1).toBe(1))\ntest("b", () => expect(0.1 + 0.2).toBe(0.3))\n'},
        },
        "command": ["npx", "-y", "vitest@3", "run"],
    },
}


def capture(scratch: Path, runner: str, kind: str, project: dict) -> dict:
    where = scratch / f"{runner}-{kind}"
    if where.exists():
        shutil.rmtree(where)
    for name, text in project["files"][kind].items():
        path = where / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    done = subprocess.run(
        project["command"],
        cwd=where,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=600,
        env={**os.environ, "NO_COLOR": "1", "CI": "1"},
    )
    output = "\n".join(line for line in done.stdout.splitlines() if not line.startswith("npm notice"))
    return {"exitCode": done.returncode, "output": output.replace(str(scratch), "/scratch")}


def main() -> None:
    scratch = Path(sys.argv[1]).resolve()
    scratch.mkdir(parents=True, exist_ok=True)
    captured, skipped = {}, []
    for runner, project in PROJECTS.items():
        if shutil.which(project["needs"]) is None:
            skipped.append(runner)
            continue
        captured[runner] = {kind: capture(scratch, runner, kind, project) for kind in (PASSING, FAILING)}
        print(runner, {kind: captured[runner][kind]["exitCode"] for kind in captured[runner]})
    lines = [
        "// Generated by scripts/capture_runner_output.py from real runs; do not edit by hand.",
        "// Each runner ran a two-test project that passes and one that fails, stderr merged into stdout.",
        "",
        f"export const SKIPPED_RUNNERS: readonly string[] = {json.dumps(skipped)}",
        "",
        "export const RUNNER_OUTPUT = " + json.dumps(captured, indent=2) + " as const",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT), "skipped:", skipped)


if __name__ == "__main__":
    main()
