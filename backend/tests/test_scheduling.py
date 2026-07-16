"""Unit tests for the pure scheduling-conflict logic (no DB required).

Run with:  pytest backend/tests/test_scheduling.py
(Install first: pip install pytest)
"""

from datetime import date, time

from app.services.scheduling import intervals_overlap, terms_overlap


def t(h: int, m: int = 0) -> time:
    return time(h, m)


SPRING = (date(2026, 1, 1), date(2026, 3, 31))
SUMMER = (date(2026, 6, 1), date(2026, 8, 31))
STRADDLE = (date(2026, 2, 1), date(2026, 5, 1))


# ---- time overlap (same weekly convention) ----
def test_same_day_overlap():
    assert intervals_overlap(0, t(9), t(11), 0, t(10), t(12)) is True


def test_touching_edges_do_not_overlap():
    assert intervals_overlap(0, t(9), t(10), 0, t(10), t(11)) is False


def test_different_day_never_overlaps():
    assert intervals_overlap(0, t(9), t(11), 1, t(9), t(11)) is False


# ---- term awareness (the false-positive fix) ----
def test_same_slot_disjoint_terms_no_conflict():
    assert intervals_overlap(0, t(10), t(11), 0, t(10), t(11), SPRING, SUMMER) is False


def test_same_slot_overlapping_terms_conflict():
    assert intervals_overlap(0, t(10), t(11), 0, t(10), t(11), SPRING, STRADDLE) is True


def test_none_term_is_unbounded():
    assert (
        intervals_overlap(0, t(10), t(11), 0, t(10), t(11), (None, None), SUMMER)
        is True
    )


# ---- terms_overlap directly ----
def test_terms_disjoint():
    assert terms_overlap(*SPRING, *SUMMER) is False


def test_terms_adjacent_inclusive():
    assert (
        terms_overlap(
            date(2026, 1, 1), date(2026, 3, 31), date(2026, 3, 31), date(2026, 4, 1)
        )
        is True
    )


def test_open_end_overlaps():
    assert (
        terms_overlap(date(2026, 1, 1), None, date(2027, 1, 1), date(2027, 2, 1))
        is True
    )
