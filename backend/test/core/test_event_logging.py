from backend.core.models import SensorState


class DummyLogger:
    def __init__(self):
        self.messages = []

    def info(self, message, *args):
        self.messages.append(message % args if args else message)


def test_log_event_writes_to_state_and_logger():
    from backend.core.event_logging import log_event

    state = SensorState()
    logger = DummyLogger()

    log_event(state, logger, 'Alarm acknowledged')

    assert state.logs[0]['msg'] == 'Alarm acknowledged'
    assert logger.messages == ['Alarm acknowledged']
