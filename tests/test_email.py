"""
tests/test_email.py

Transactional email dispatch tests (Week 2, Day 4):

- send_welcome_email no-ops when EMAIL_API_KEY is unset.
- send_welcome_email dispatches via Resend when configured (mocked httpx).
- send_welcome_email swallows transport failures and returns False (never
  raises) so signup can't roll back.
- Signup route schedules the welcome email via BackgroundTasks (non-blocking)
  and returns 201 regardless of provider availability.
"""
import httpx
from conftest import unique_email, valid_signup_payload

from app.core import email as email_module
from app.core.config import settings
from app.services import user_service


class _RecordingBackgroundTasks:
    """Minimal BackgroundTasks stand-in that records what would run."""

    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args, **kwargs):
        self.tasks.append((fn, args, kwargs))


class TestSendWelcomeEmailUnit:
    def test_no_op_when_api_key_unset(self, monkeypatch):
        monkeypatch.setattr(settings, "email_api_key", "")
        result = email_module.send_welcome_email("a@example.com", "Alice")
        assert result is False

    def test_dispatches_when_key_set(self, monkeypatch):
        monkeypatch.setattr(settings, "email_api_key", "test-key")
        monkeypatch.setattr(settings, "email_from", "onboarding@example.com")

        class FakeResponse:
            def raise_for_status(self):
                return None

        class FakeClient:
            def __init__(self, *a, **k):
                self.posted = None

            def post(self, url, **kwargs):
                self.posted = (url, kwargs)
                return FakeResponse()

            def close(self):
                pass

        fake = FakeClient()
        result = email_module.send_welcome_email(
            "a@example.com", "Alice", client=fake
        )
        assert result is True
        url, kwargs = fake.posted
        assert url == email_module.RESEND_ENDPOINT
        assert kwargs["headers"]["Authorization"] == "Bearer test-key"
        assert kwargs["json"]["to"] == ["a@example.com"]
        assert "Alice" in kwargs["json"]["html"]

    def test_transport_error_returns_false_not_raises(self, monkeypatch):
        monkeypatch.setattr(settings, "email_api_key", "test-key")

        class BoomClient:
            def post(self, *a, **k):
                raise httpx.ConnectTimeout("timeout")

            def close(self):
                pass

        result = email_module.send_welcome_email(
            "a@example.com", "Alice", client=BoomClient()
        )
        assert result is False


class TestSignupSchedulesEmail:
    def test_create_user_schedules_welcome_email_after_commit(self, db):
        tasks = _RecordingBackgroundTasks()
        data = valid_signup_payload(unique_email())
        from app.schemas.user import UserCreate

        user_in = UserCreate(
            email=data["email"],
            password=data["password"],
            full_name=data["full_name"],
            university=data.get("university"),
            field_of_study=data.get("field_of_study"),
            year_of_study=data.get("year_of_study"),
            terms_version=data["terms_version"],
            privacy_version=data["privacy_version"],
        )
        user = user_service.create_user(db, user_in, background_tasks=tasks)

        # Exactly one welcome-email task scheduled with the new user's data.
        assert len(tasks.tasks) == 1
        fn, args, kwargs = tasks.tasks[0]
        assert fn is email_module.send_welcome_email
        assert kwargs == {"to_email": user.email, "full_name": user.full_name}
