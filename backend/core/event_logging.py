from collections.abc import Callable

from backend.core.models import SensorState


def log_event(
    state: SensorState,
    logger: object,
    message: str,
    level: str = "info",
    fields: dict[str, object] | None = None,
) -> None:
    state.add_log(message, fields=fields)
    log_method = getattr(logger, level, None)
    if not callable(log_method):
        log_method = logger.info
    cast_method: Callable[[str], None] = log_method
    cast_method(message)
