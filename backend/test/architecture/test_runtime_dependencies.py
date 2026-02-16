from pathlib import Path


def test_websocket_runtime_dependency_declared():
    pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
    content = pyproject.read_text(encoding="utf-8")

    assert '"websockets' in content
