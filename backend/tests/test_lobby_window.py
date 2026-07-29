"""The class link is only live during the class.

Two defects lived here. The window was computed from `datetime.now()` — the
*server's* naive clock — against a schedule stored in the academy's wall-clock,
so a UTC host shifted every window by the academy's UTC offset. And it only ever
asked "has it nearly started?", which stays true forever once the class begins,
leaving the link reachable months later.

These drive `lobby_access` directly with fixed timestamps: the edges are exactly
what regressed, and asserting them against the real clock would make the suite
depend on the hour it runs at.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.routers.meetings import LOBBY_EARLY_ACCESS_MINUTES, lobby_access

TZ = ZoneInfo(settings.academy_timezone)
START = datetime(2026, 3, 10, 18, 0, tzinfo=TZ)
END = datetime(2026, 3, 10, 20, 0, tzinfo=TZ)


def _at(now: datetime, *, is_host: bool = False):
    return lobby_access(
        cancelled=False,
        start_dt=START,
        end_dt=END,
        now_dt=now,
        is_host=is_host,
        join_url="https://zoom.us/j/CLASS",
        host_url="https://zoom.us/j/CLASS?host=1",
    )


def test_the_link_is_withheld_before_the_window_opens():
    info = _at(START - timedelta(minutes=LOBBY_EARLY_ACCESS_MINUTES + 1))
    assert info.can_join is False
    assert info.join_url is None


def test_the_link_opens_exactly_at_the_window_edge():
    info = _at(START - timedelta(minutes=LOBBY_EARLY_ACCESS_MINUTES))
    assert info.can_join is True
    assert info.join_url == "https://zoom.us/j/CLASS"


def test_the_link_stays_live_during_the_class():
    info = _at(START + timedelta(minutes=30))
    assert info.can_join is True


def test_the_link_dies_when_the_class_ends():
    """The regression: `seconds_until_start <= 15*60` was also true here."""
    info = _at(END + timedelta(minutes=1))
    assert info.can_join is False
    assert info.join_url is None
    assert "terminó" in info.reason

    much_later = _at(END + timedelta(days=90))
    assert much_later.can_join is False
    assert much_later.join_url is None


def test_a_student_never_receives_the_host_link():
    info = _at(START + timedelta(minutes=1))
    assert info.host_url is None
    assert info.is_host is False


def test_the_host_is_not_held_to_the_student_window():
    early = _at(START - timedelta(hours=6), is_host=True)
    assert early.can_join is True
    assert early.host_url == "https://zoom.us/j/CLASS?host=1"


def test_a_cancelled_class_admits_nobody():
    for is_host in (True, False):
        info = lobby_access(
            cancelled=True,
            start_dt=START,
            end_dt=END,
            now_dt=START + timedelta(minutes=5),
            is_host=is_host,
            join_url="https://zoom.us/j/CLASS",
            host_url="https://zoom.us/j/CLASS?host=1",
        )
        assert info.can_join is False, is_host
        assert info.join_url is None
        assert info.host_url is None


def test_the_window_follows_the_academy_clock_not_the_server():
    """A class at 18:00 in Guatemala is 00:00 UTC — the same instant.

    The bug was comparing an academy wall-clock time against a naive server
    `now()`: on a UTC host, 18:00 local was read as 18:00 UTC and the window
    opened six hours early.
    """
    same_instant_utc = START.astimezone(ZoneInfo("UTC"))
    assert _at(same_instant_utc).can_join is True

    # Six hours before the class in academy time is still firmly shut.
    assert _at(START - timedelta(hours=6)).can_join is False
