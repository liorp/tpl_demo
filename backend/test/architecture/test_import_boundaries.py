from pathlib import Path


def test_api_does_not_import_serial_module():
    routes = Path("backend/api/routes.py")
    if not routes.exists():
        routes = Path("api/routes.py")
    if not routes.exists():
        raise AssertionError("Expected api/routes.py to exist")

    content = routes.read_text()

    assert "from backend.serial" not in content
    assert "import backend.serial" not in content


def test_service_does_not_import_serial_or_contextlib():
    service_file = Path("backend/core/service.py")
    content = service_file.read_text()
    assert "import serial" not in content
    assert "import contextlib" not in content
