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
    cast_method: Callable[..., None] = log_method
    kwargs: dict[str, object] = {}
    if fields:
        kwargs["extra"] = {"raw_event": fields}
    cast_method(message, **kwargs)
