import json

from backend.core.logging_setup import configure_logging


def test_configure_logging_adds_stdout_and_rotating_file_handlers(tmp_path):
    log_file = tmp_path / 'app.log'

    logger = configure_logging(
        name='tpl-signum-test-handlers',
        level='INFO',
        log_file=str(log_file),
        max_bytes=1024,
        backup_count=2,
    )

    handler_types = {type(h).__name__ for h in logger.handlers}
    assert 'StreamHandler' in handler_types
    assert 'RotatingFileHandler' in handler_types


def test_configure_logging_is_idempotent(tmp_path):
    log_file = tmp_path / 'app.log'

    logger1 = configure_logging(
        'tpl-signum-test-idempotent',
        'INFO',
        str(log_file),
        1024,
        2,
    )
    first_handler_count = len(logger1.handlers)

    logger2 = configure_logging(
        'tpl-signum-test-idempotent',
        'INFO',
        str(log_file),
        1024,
        2,
    )
    second_handler_count = len(logger2.handlers)

    assert logger1 is logger2
    assert second_handler_count == first_handler_count


def test_configure_logging_formats_records_as_json_with_raw_event(tmp_path):
    log_file = tmp_path / 'app.log'

    logger = configure_logging(
        name='tpl-signum-test-json',
        level='INFO',
        log_file=str(log_file),
        max_bytes=1024,
        backup_count=2,
    )

    raw_event = {'type': 'config', 'threshold': 123, 'value': 9}
    logger.info('CONFIG threshold=123 gain=9', extra={'raw_event': raw_event})

    lines = log_file.read_text(encoding='utf-8').splitlines()
    payload = json.loads(lines[-1])

    assert payload['message'] == 'CONFIG threshold=123 gain=9'
    assert payload['logger'] == 'tpl-signum-test-json'
    assert payload['level'] == 'INFO'
    assert payload['raw_event'] == raw_event
