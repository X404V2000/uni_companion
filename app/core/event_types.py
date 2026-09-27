"""app/core/event_types.py

PURPOSE
-------
Single source of truth for every `usage_events.event_type` value.

WHY
---
Event types were string literals scattered across analytics code. A typo
(e.g. "SUMMARY_GENERATED" vs "SUMMARY_GENERATEDD") silently never matches in
the metrics aggregation — the metric returns 0 forever with no error, no log,
no crash. Centralizing the enum means a wrong name fails loudly at import /
type-check time, and the guard test locks it.

CONVENTION
----------
Event-type strings are UPPERCASE. This matches the values written by Day 3
(already persisted in usage_events) — do NOT change casing without a data
migration, or existing rows become invisible to metrics.

ADDING A NEW EVENT TYPE
-----------------------
1. Add a member to this enum.
2. Run the guard test — it asserts metrics only reference registered names.
"""
from __future__ import annotations

from enum import Enum


class EventType(str, Enum):
    # Day 3 (core loop)
    SUMMARY_GENERATED = "SUMMARY_GENERATED"
    SUMMARY_CACHE_HIT = "SUMMARY_CACHE_HIT"
    MATERIALS_SEARCHED = "MATERIALS_SEARCHED"
    SYNC_PUSHED = "SYNC_PUSHED"
    DASHBOARD_VIEWED = "DASHBOARD_VIEWED"
    # Day 4 (sharing + friction)
    MODULE_SHARE = "MODULE_SHARE"
    SUMMARIZE_DURATION = "SUMMARIZE_DURATION"
    SYNC_PUSH_DURATION = "SYNC_PUSH_DURATION"


# Every valid event-type string, for fast membership checks.
ALL_EVENT_TYPE_VALUES = frozenset(e.value for e in EventType)
