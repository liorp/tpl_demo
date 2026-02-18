from backend.main import app


def test_app_uses_lifespan_instead_of_on_event_hooks():
    assert len(app.router.on_startup) == 0
    assert len(app.router.on_shutdown) == 0
