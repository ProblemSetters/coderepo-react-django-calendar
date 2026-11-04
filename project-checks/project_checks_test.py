"""Run with PROJECT_ROOT=/path/to/project python -m pytest project_checks_test.py -v -s."""

import fnmatch
import json
import math
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
import tomllib
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

import pytest

if os.environ.get("PROJECT_CHECK_ACTIVE") == "1":
    pytest.skip(
        "Application tests do not recursively run project checks",
        allow_module_level=True,
    )

import jsonschema
import yaml

pytestmark = pytest.mark.skipif(
    os.environ.get("PROJECT_CHECK_ACTIVE") == "1",
    reason="Application tests do not recursively run project checks",
)
ROOT = Path(os.environ.get("PROJECT_ROOT", ".")).resolve()
HERE = Path(__file__).resolve().parent
REQUIRED = [
    "frontend",
    "frontend/src",
    "frontend/src/features",
    "frontend/src/shared",
    "backend",
    "backend/apps",
    "backend/apps/shared",
    "backend/scripts",
    ".vscode",
]
EXCLUDED = {
    ".git",
    "project-checks",
    "node_modules",
    ".venv",
    "venv",
    ".gradle",
    ".m2",
    ".cache",
    "__pycache__",
    ".ruff_cache",
}
GENERATED = {
    "dist",
    "build",
    "coverage",
    "frontend/dist",
    "frontend/build",
    "frontend/coverage",
    "backend/dist",
    "backend/build",
    "backend/coverage",
    "backend/target",
}
REPORT_ROOTS = {"testsuite", "testsuites", "testng-results", "testrun"}
EXACT_JS = re.compile(r"^[v=]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def files(root, generated=True):
    result = []
    for parent, directories, names in os.walk(root):
        relative = Path(parent).relative_to(root)
        directories[:] = [
            name
            for name in directories
            if name not in EXCLUDED
            and (not generated or (relative / name).as_posix() not in GENERATED)
        ]
        for name in directories + names:
            assert not (Path(parent) / name).is_symlink(), (
                f"Cannot reliably inspect symbolic path: {relative / name}"
            )
        for name in names:
            if name not in EXCLUDED:
                filename = relative / name
                assert (root / filename).is_file(), f"Not a regular file: {filename}"
                result.append(filename)
    return sorted(result)


class UniqueLoader(yaml.SafeLoader):
    """Reject duplicate YAML fields instead of silently taking the last value."""


def unique_mapping(loader, node, deep=False):
    seen = set()
    for key_node, _ in node.value:
        if key_node.tag == "tag:yaml.org,2002:merge":
            continue
        key = loader.construct_object(key_node, deep=deep)
        assert key not in seen, f"Duplicate configuration field: {key}"
        seen.add(key)
    loader.flatten_mapping(node)
    return yaml.SafeLoader.construct_mapping(loader, node, deep=deep)


UniqueLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping
)


def configuration():
    documents = list(
        yaml.load_all((ROOT / "hackerrank.yml").read_text(), Loader=UniqueLoader)
    )
    assert len(documents) == 1, "Configuration must contain one YAML document"
    data = documents[0]
    jsonschema.Draft4Validator(
        json.loads((HERE / "project-config.schema.json").read_text())
    ).validate(data)
    config = data["configuration"]
    menu = config["ide_config"]["project_menu"]
    for name in ("install", "run", *(("test",) if "test" in menu else ())):
        command = config["ide_config"]["project_menu"].get(name)
        assert isinstance(command, str) and command.strip(), f"Missing {name} command"
    if "scoring" in config:
        assert config["scoring"].get("command", "").strip(), "Missing scoring command"
    return config


def selected_test_command(config, workspace):
    menu = config["ide_config"]["project_menu"]
    if "test" in menu:
        return menu["test"]
    manifest = json.loads((workspace / "package.json").read_text())
    scripts = manifest.get("scripts")
    if scripts is None and "scripts" not in manifest:
        return None
    assert isinstance(scripts, dict), "Root package.json scripts must be an object"
    if "test" not in scripts:
        return None
    assert isinstance(scripts["test"], str) and scripts["test"].strip(), (
        "Root package.json scripts.test must be a nonblank string"
    )
    declared = manifest.get("packageManager", "")
    declared = declared.split("@", 1)[0] if isinstance(declared, str) else ""
    manager = (
        declared
        if declared in {"bun", "npm", "pnpm", "yarn"}
        else next(
            (
                tool
                for filename, tool in [
                    ("bun.lock", "bun"),
                    ("bun.lockb", "bun"),
                    ("pnpm-lock.yaml", "pnpm"),
                    ("yarn.lock", "yarn"),
                    ("package-lock.json", "npm"),
                    ("npm-shrinkwrap.json", "npm"),
                ]
                if (workspace / filename).is_file()
            ),
            "npm",
        )
    )
    return f"{manager} run test"


def pinned_js(version):
    if EXACT_JS.fullmatch(version):
        return True
    if version.startswith("npm:"):
        return bool(EXACT_JS.fullmatch(version.rsplit("@", 1)[-1]))
    return bool(
        re.match(r"^(?:git\+|git:|github:|gitlab:|bitbucket:)", version)
        and re.search(r"#[a-fA-F0-9]{40}$", version)
    )


def test_initial_project_has_no_xml_reports():
    found = []
    for name in files(ROOT, generated=False):
        if name.suffix.lower() != ".xml":
            continue
        hint = re.search(
            r"(?:^|/)(?:test-results|test-reports|surefire-reports|failsafe-reports)/",
            name.as_posix(),
            re.I,
        ) or re.match(
            r"(?:TEST-|junit)|test[-_]results\.xml$|test[-_]report\.xml$|testng-results\.xml$",
            name.name,
            re.I,
        )
        if (
            hint
            or ET.parse(ROOT / name).getroot().tag.split("}")[-1].lower()
            in REPORT_ROOTS
        ):
            found.append(str(name))
    assert not found, f"Existing test XML reports: {found}"


def test_required_paths():
    for name in REQUIRED:
        parent = ROOT
        for component in name.split("/"):
            assert component in os.listdir(parent), f"Required path missing: {name}"
            parent /= component
            # A regular file may replace the entry and its directory subtree.
            if parent.is_file():
                break
            assert parent.is_dir(), f"Unsupported entry: {name}"


def test_root_readme_exists():
    assert "README.md" in os.listdir(ROOT) and (ROOT / "README.md").is_file(), (
        "Root README.md must exist as a file"
    )


def test_configuration_and_required_commands():
    configuration()


def test_javascript_dependencies_are_pinned():
    manifests = []
    names = {}
    for filename in files(ROOT):
        if filename.name != "package.json":
            continue
        data = json.loads((ROOT / filename).read_text())
        assert isinstance(data, dict), f"{filename} must contain an object"
        manifests.append((filename, data))
        if data.get("name"):
            names[data["name"]] = names.get(data["name"], 0) + 1
    assert any(filename == Path("package.json") for filename, _ in manifests), (
        "Root package.json is required"
    )
    errors = []
    for filename, manifest in manifests:
        for section in (
            "dependencies",
            "devDependencies",
            "optionalDependencies",
            "peerDependencies",
        ):
            values = manifest.get(section, {})
            assert isinstance(values, dict), f"{filename}: invalid {section}"
            for dependency, raw in values.items():
                version = raw.strip() if isinstance(raw, str) else ""
                exact = pinned_js(version)
                if version.startswith("workspace:"):
                    exact = names.get(dependency) == 1
                if version.startswith(("file:", "link:")):
                    reference = version.split(":", 1)[1]
                    target = (ROOT / filename.parent / reference).resolve()
                    exact = (
                        bool(reference)
                        and target.is_relative_to(ROOT)
                        and target.exists()
                    )
                if not exact:
                    errors.append(
                        f"{filename}: {section}.{dependency} is not pinned: {raw!r}"
                    )
    assert not errors, "\n".join(errors)


def pinned_python(requirement):
    declaration = requirement.split(";", 1)[0].strip()
    match = re.match(
        r"^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9_,. -]+\])?\s*(.*)$", declaration
    )
    if not match:
        return False
    version = match[2].strip("() ")
    if version.startswith("@"):
        reference = version[1:].strip()
        if reference.startswith("git+"):
            return bool(re.search(r"@[a-fA-F0-9]{40}$", reference.split("#", 1)[0]))
        return bool(re.search(r"(?:#|&)sha256=[a-fA-F0-9]{64}(?:&|$)", reference))
    return bool(
        re.search(r"(?:^|,)\s*={2,3}\s*[0-9][A-Za-z0-9.!+_-]*\s*(?:,|$)", version)
    )


def test_python_dependencies_are_pinned():
    manifests = [
        name
        for name in files(ROOT)
        if name.name == "pyproject.toml"
        or (name.name.startswith("requirements") and name.suffix == ".txt")
        or ("requirements" in name.parts and name.suffix == ".txt")
    ]
    assert manifests, "No Python dependency declarations found"
    errors, visited = [], set()

    def check(requirement, location):
        if not pinned_python(requirement):
            errors.append(
                f"{location}: unpinned or unsupported requirement: {requirement}"
            )

    def requirements(name):
        if name in visited:
            return
        visited.add(name)
        text = (ROOT / name).read_text().replace("\\\r\n", " ").replace("\\\n", " ")
        for number, value in enumerate(text.splitlines(), 1):
            line = value.strip().split(" #", 1)[0]
            if not line or line.startswith("#"):
                continue
            include = re.match(
                r"^(?:-r|--requirement|-c|--constraint)(?:\s+|=)(.+)$", line
            )
            if include:
                target = (ROOT / name.parent / include[1].strip()).resolve()
                assert target.is_relative_to(ROOT), (
                    "Requirements include must remain inside the project"
                )
                requirements(target.relative_to(ROOT))
            elif line.startswith("--"):
                assert re.match(
                    r"^--(?:index-url|extra-index-url|trusted-host|find-links|no-index|only-binary|prefer-binary|require-hashes|pre)(?:\s|=|$)",
                    line,
                ), f"Unsupported requirement option: {line}"
            else:
                check(line.split(" --hash=", 1)[0].strip(), f"{name}:{number}")

    for name in manifests:
        if name.name != "pyproject.toml":
            requirements(name)
            continue
        data = tomllib.loads((ROOT / name).read_text())
        project = data.get("project", {})
        assert not set(project.get("dynamic", [])) & {
            "dependencies",
            "optional-dependencies",
        }, "Dynamic Python dependencies cannot be checked statically"
        values = list(project.get("dependencies", [])) + data.get(
            "build-system", {}
        ).get("requires", [])
        for group in project.get("optional-dependencies", {}).values():
            values.extend(group)
        for group in data.get("dependency-groups", {}).values():
            for item in group:
                if isinstance(item, str):
                    values.append(item)
                else:
                    assert (
                        isinstance(item, dict)
                        and item.get("include-group") in data["dependency-groups"]
                    ), "Invalid dependency-group reference"
        for value in values:
            check(value, name)
        poetry = data.get("tool", {}).get("poetry", {})
        for group in [
            poetry.get("dependencies", {}),
            poetry.get("dev-dependencies", {}),
            *[g.get("dependencies", {}) for g in poetry.get("group", {}).values()],
        ]:
            for package, value in group.items():
                if package == "python":
                    continue
                if isinstance(value, dict):
                    assert not set(value) & {"git", "url", "path"}, (
                        "Unsupported Poetry source dependency"
                    )
                    value = value.get("version")
                assert isinstance(value, str), (
                    f"Cannot resolve Poetry dependency: {package}"
                )
                check(
                    package
                    + ("==" + value if not re.search(r"[<>=~^*|, ]", value) else value),
                    name,
                )
    assert not errors, "\n".join(errors)


class Command:
    def __init__(self, script, cwd):
        self.started = time.monotonic()
        self.output = bytearray()
        environment = {**os.environ, "PROJECT_CHECK_ACTIVE": "1"}
        environment.pop("NODE_TEST_CONTEXT", None)
        self.process = subprocess.Popen(
            ["bash", "-e", "-o", "pipefail", "-c", script],
            cwd=cwd,
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        for data in iter(lambda: self.process.stdout.read(4096), b""):
            if len(self.output) < 1048576:
                self.output.extend(data[: 1048576 - len(self.output)])

    def wait(self, seconds, app=None):
        deadline = time.monotonic() + seconds
        while self.process.poll() is None:
            assert time.monotonic() < deadline, (
                f"Command timed out after {seconds}s: {self.text()}"
            )
            assert app is None or app.process.poll() is None, (
                "Run command exited while tests were running"
            )
            time.sleep(0.02)
        self.reader.join(timeout=1)
        assert self.process.returncode == 0, (
            f"Command failed ({self.process.returncode}): {self.text()}"
        )

    def text(self):
        return self.output.decode(errors="replace")

    def stop(self):
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(self.process.pid, sig)
            except ProcessLookupError:
                break
            try:
                self.process.wait(timeout=0.2)
            except subprocess.TimeoutExpired:
                pass
        self.process.wait(timeout=3)
        self.reader.join(timeout=1)


def tool(name):
    choices = (
        [
            ROOT / parent / "node_modules/.bin" / name
            for parent in ("", "frontend", "backend")
        ]
        if name == "eslint"
        else [
            ROOT / parent / environment / "bin/ruff"
            for parent in ("", "backend")
            for environment in (".venv", "venv")
        ]
    )
    return str(
        next(
            (
                filename
                for filename in choices
                if filename.is_file() and os.access(filename, os.X_OK)
            ),
            name,
        )
    )


def timeout(name, default):
    value = float(os.environ.get(f"CHECK_{name}_TIMEOUT_SECONDS", default))
    assert math.isfinite(value) and value > 0, f"Invalid {name} timeout"
    return value


@pytest.mark.parametrize("language", ["javascript", "python"])
def test_lint(language):
    extensions = (
        {".js", ".jsx", ".mjs", ".cjs"} if language == "javascript" else {".py", ".pyi"}
    )
    targets = [
        "./" + name.as_posix() for name in files(ROOT) if name.suffix in extensions
    ]
    if not targets:
        pytest.skip("No applicable source files")
    if language == "javascript":
        args = [
            tool("eslint"),
            "--no-config-lookup",
            "--no-inline-config",
            "--no-ignore",
            "--max-warnings",
            "0",
            "--config",
            str(HERE / "eslint.config.mjs"),
            "--",
            *targets,
        ]
    else:
        args = [
            tool("ruff"),
            "check",
            "--config",
            str(HERE / "ruff.toml"),
            "--no-fix",
            "--no-cache",
            "--no-respect-gitignore",
            "--ignore-noqa",
            "--output-format",
            "concise",
            "--",
            *targets,
        ]
    command = Command(shlex.join(args), ROOT)
    try:
        command.wait(timeout("LINT", 120))
    finally:
        command.stop()


def path_matches(pattern, name):
    parts = name.split("/")
    matched = [True] + [False] * len(parts)
    for part in pattern.split("/"):
        after = [part == "**" and matched[0]] + [False] * len(parts)
        for index, value in enumerate(parts, 1):
            after[index] = (
                (matched[index] or after[index - 1])
                if part == "**"
                else matched[index - 1] and fnmatch.fnmatchcase(value, part)
            )
        matched = after
    return matched[-1]


def report_snapshot(root, patterns):
    return {
        name: (stat.st_ino, stat.st_size, stat.st_mtime_ns)
        for name in files(root, False)
        if name.suffix.lower() == ".xml"
        and any(path_matches(pattern, name.as_posix()) for pattern in patterns)
        for stat in [(root / name).stat()]
    }


def test_install_run_test_and_generated_xml():
    config = configuration()
    commands = []
    with tempfile.TemporaryDirectory(prefix="project-check-") as temporary:
        workspace = Path(temporary) / "app"
        files(ROOT)

        def ignore(parent, names):
            relative = Path(parent).relative_to(ROOT)
            return [
                name
                for name in names
                if name in EXCLUDED or (relative / name).as_posix() in GENERATED
            ]

        shutil.copytree(ROOT, workspace, ignore=ignore)
        try:
            menu = config["ide_config"]["project_menu"]
            install = Command(menu["install"], workspace)
            commands.append(install)
            install.wait(timeout("INSTALL", 600))
            print(f"Install: {time.monotonic() - install.started:.3f}s")
            urls = json.loads(
                os.environ.get(
                    "CHECK_READY_URLS",
                    '["http://127.0.0.1:3000/","http://127.0.0.1:8000/"]',
                )
            )
            assert isinstance(urls, list) and urls, "Specify readiness URLs"
            from urllib.parse import urlparse

            for url in urls:
                parsed = urlparse(url)
                assert parsed.hostname in {"localhost", "127.0.0.1", "::1"}, (
                    "Readiness URL must be local"
                )
                try:
                    with socket.create_connection(
                        (
                            parsed.hostname,
                            parsed.port or (443 if parsed.scheme == "https" else 80),
                        ),
                        timeout=0.25,
                    ):
                        pytest.fail(f"Readiness port is already occupied: {url}")
                except OSError:
                    pass
            app = Command(menu["run"], workspace)
            commands.append(app)
            deadline = time.monotonic() + timeout("STARTUP", 120)
            while True:
                assert app.process.poll() is None, f"Run command exited: {app.text()}"
                ready = True
                for url in urls:
                    try:
                        with urllib.request.urlopen(url, timeout=1) as response:
                            ready = ready and response.status < 500
                    except urllib.error.HTTPError as error:
                        ready = ready and error.code < 500
                    except (OSError, urllib.error.URLError):
                        ready = False
                if ready:
                    break
                assert time.monotonic() < deadline, f"Startup timed out: {app.text()}"
                time.sleep(0.1)
            print(f"Startup: {time.monotonic() - app.started:.3f}s")
            selected_test = selected_test_command(config, workspace)
            if selected_test is None:
                print(
                    "Test and generated XML checks skipped: no test command configured"
                )
                return
            source = (
                "hackerrank.yml" if "test" in menu else "root package.json scripts.test"
            )
            print(f"Test command source: {source}; command: {selected_test}")
            scoring = config.get("scoring", {})
            patterns = [
                name
                for name in scoring.get("files", [])
                if isinstance(name, str) and name.lower().endswith(".xml")
            ]
            if "files" in scoring:
                assert patterns, "Scoring files must specify XML reports"
            else:
                print("Generated XML checks skipped: no scoring files configured")
            for pattern in patterns:
                assert (
                    not Path(pattern).is_absolute()
                    and ".." not in Path(pattern).parts
                    and "\\" not in pattern
                ), f"Invalid report path: {pattern}"
            before = report_snapshot(workspace, patterns)
            command = Command(selected_test, workspace)
            commands.append(command)
            errors = []
            try:
                command.wait(timeout("TEST", 300), app)
            except AssertionError as error:
                errors.append(str(error))
            print(f"Test: {time.monotonic() - command.started:.3f}s\n{command.text()}")
            assert command.process.poll() is not None, "Test command did not finish"
            after = report_snapshot(workspace, patterns)
            for pattern in patterns:
                names = [
                    name for name in after if path_matches(pattern, name.as_posix())
                ]
                if not names:
                    errors.append(f"XML report not generated: {pattern}")
                for name in names:
                    if before.get(name) == after[name]:
                        errors.append(f"XML report is stale: {name}")
                    try:
                        assert (
                            ET.parse(workspace / name)
                            .getroot()
                            .tag.split("}")[-1]
                            .lower()
                            in REPORT_ROOTS
                        ), f"Not a test report: {name}"
                    except (AssertionError, ET.ParseError) as error:
                        errors.append(str(error))
            assert app.process.poll() is None, "Run command exited during tests"
            assert not errors, "\n".join(errors)
        finally:
            for command in reversed(commands):
                command.stop()
