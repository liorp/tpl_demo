import importlib


def test_logging_defaults(monkeypatch):
    monkeypatch.delenv('APP_LOG_LEVEL', raising=False)
    monkeypatch.delenv('APP_LOG_FILE', raising=False)
    monkeypatch.delenv('APP_LOG_MAX_BYTES', raising=False)
    monkeypatch.delenv('APP_LOG_BACKUP_COUNT', raising=False)

    import backend.config as config_module

    importlib.reload(config_module)

    assert config_module.APP_LOG_LEVEL == 'INFO'
    assert config_module.APP_LOG_FILE.endswith('backend/data/app.log')
    assert config_module.APP_LOG_MAX_BYTES == 1_048_576
    assert config_module.APP_LOG_BACKUP_COUNT == 5
