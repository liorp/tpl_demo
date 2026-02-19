import asyncio
import json

from fastapi import WebSocket


class Broadcaster:
    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._clients: list[WebSocket] = []

    async def start(self) -> None:
        while True:
            msg = await self._queue.get()
            disconnected = []
            for ws in self._clients:
                try:
                    await ws.send_text(msg)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                if ws in self._clients:
                    self._clients.remove(ws)

    def enqueue(self, payload: dict) -> None:
        self._queue.put_nowait(json.dumps(payload))

    async def register(self, ws: WebSocket, initial_payload: dict) -> None:
        await ws.accept()
        self._clients.append(ws)
        await ws.send_text(json.dumps(initial_payload))

    async def unregister(self, ws: WebSocket) -> None:
        if ws in self._clients:
            self._clients.remove(ws)
