import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def configure_logging(
    name: str,
    level: str,
    log_file: str,
    max_bytes: int,
    backup_count: int,
) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.handlers.clear()
    logger.setLevel(level)
    logger.propagate = False

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s %(message)s")

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger
