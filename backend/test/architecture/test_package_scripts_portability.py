from __future__ import annotations

import json
import re
from pathlib import Path

POSIX_DEFAULT_EXPANSION = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*:-")


def _iter_scripts(package_json_path: Path) -> list[tuple[str, str]]:
    package_json = json.loads(package_json_path.read_text())
    scripts = package_json.get('scripts', {})
    return [(name, command) for name, command in scripts.items() if isinstance(command, str)]


def test_package_scripts_avoid_posix_default_expansion_for_windows_compatibility() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    package_files = [repo_root / 'package.json', repo_root / 'frontend' / 'package.json']

    incompatible_scripts: list[str] = []
    for package_file in package_files:
        for script_name, command in _iter_scripts(package_file):
            if POSIX_DEFAULT_EXPANSION.search(command):
                incompatible_scripts.append(f'{package_file.relative_to(repo_root)}:{script_name}')

    assert incompatible_scripts == [], (
        'POSIX parameter default expansion (${VAR:-default}) is not Windows compatible. '
        f'Found in scripts: {", ".join(incompatible_scripts)}'
    )
