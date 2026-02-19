import asyncio
import contextlib

from backend.realtime.broadcaster import Broadcaster


class FakeWebSocket:
    def __init__(self):
        self.messages = []

    async def accept(self):
        return None

    async def send_text(self, message: str):
        self.messages.append(message)


def test_broadcaster_register_and_broadcast():
    async def run():
        broadcaster = Broadcaster()
        task = asyncio.create_task(broadcaster.start())

        ws = FakeWebSocket()
        await broadcaster.register(ws, {"connected": False})
        broadcaster.enqueue({"connected": True})

        await asyncio.sleep(0.05)

        assert len(ws.messages) >= 2
        assert '"connected": true' in ws.messages[-1]

        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(run())
