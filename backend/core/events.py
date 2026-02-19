from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.core.models import Event


@dataclass(frozen=True)
class SerialEvent:
    event: Event


@dataclass(frozen=True)
class SerialConnected:
    port: str


@dataclass(frozen=True)
class SerialIdle:
    pass


@dataclass(frozen=True)
class SerialDisconnect:
    reason: str | None


SerialMessage = SerialEvent | SerialConnected | SerialIdle | SerialDisconnect


class MessageSink(Protocol):
    def put_nowait(self, msg: SerialMessage) -> None: ...
