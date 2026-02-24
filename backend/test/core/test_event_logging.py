from backend.core.models import SensorState


class DummyLogger:
    def __init__(self):
        self.messages = []
        self.kwargs = []

    def info(self, message, *args, **kwargs):
        self.messages.append(message % args if args else message)
        self.kwargs.append(kwargs)


def test_log_event_writes_to_state_and_logger():
    from backend.core.event_logging import log_event

    state = SensorState()
    logger = DummyLogger()

    log_event(state, logger, 'Alarm acknowledged')

    assert state.logs[0]['msg'] == 'Alarm acknowledged'
    assert logger.messages == ['Alarm acknowledged']


def test_log_event_passes_raw_event_to_logger_extra():
    from backend.core.event_logging import log_event

    state = SensorState()
    logger = DummyLogger()
    raw_event = {
        'type': 'detection',
        'unit_a': 1,
        'unit_b': 2,
        'value': 777,
    }

    log_event(state, logger, 'DETECTION S1-S2', fields=raw_event)

    assert logger.kwargs[0]['extra']['raw_event'] == raw_event
