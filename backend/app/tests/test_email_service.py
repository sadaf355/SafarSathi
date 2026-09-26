"""send_notification_email must be a complete no-op while email notifications
are disabled (the default) - no Resend call is ever attempted."""

from app.config import Settings
from app.services import email_service


def test_send_notification_email_is_noop_when_disabled(monkeypatch):
    # A key is configured, so only the disabled flag stands between us and a send.
    disabled_settings = Settings(_env_file=None, resend_api_key="re_test_key")
    assert disabled_settings.email_notifications_enabled is False
    monkeypatch.setattr("app.services.email_service.get_settings", lambda: disabled_settings)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("send_notification_email made a network call while disabled")

    monkeypatch.setattr(email_service.httpx, "post", fail_if_called)

    assert email_service.send_notification_email("traveler@example.com", "Subject", "<p>Body</p>") is False
