"""Outbound notification email via Resend.

A complete no-op unless EMAIL_NOTIFICATIONS_ENABLED is true and RESEND_API_KEY
is set - the same "absent key = skip gracefully" behavior as the Anthropic
assistant. Delivery failures are logged and reported as False, never raised:
an email is a side effect of creating a notification, not a precondition.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("triprescue.email")

RESEND_EMAILS_URL = "https://api.resend.com/emails"
_REQUEST_TIMEOUT_SECONDS = 5.0


def send_notification_email(to_email: str, subject: str, body: str) -> bool:
    """Sends `body` (HTML) to `to_email`. Returns True only if Resend accepted it."""
    settings = get_settings()
    if not settings.email_notifications_enabled or not settings.resend_api_key:
        return False

    try:
        response = httpx.post(
            RESEND_EMAILS_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.notification_from_address, "to": to_email, "subject": subject, "html": body},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception:
        logger.warning("Notification email to %s failed; continuing without it.", to_email, exc_info=True)
        return False
    return True
