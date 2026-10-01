from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode

from . import models


def _aware(value: datetime) -> datetime:
    # Legacy SQLite rows may still be naive UTC values. UTCDateTime restores the
    # marker for new reads, while this fallback keeps old data exportable.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _utc_stamp(value: datetime) -> str:
    return _aware(value).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _fold(line: str) -> list[str]:
    # RFC 5545 limits content lines to 75 octets. This conservative character
    # fold keeps UTF-8 calendar files accepted by Google and Outlook.
    if len(line.encode("utf-8")) <= 73:
        return [line]
    result: list[str] = []
    current = ""
    for char in line:
        candidate = current + char
        if len(candidate.encode("utf-8")) > 70:
            result.append(current)
            current = " " + char
        else:
            current = candidate
    if current:
        result.append(current)
    return result


class CalendarProvider:
    domain = "meeting-management-ictu"

    def uid(self, meeting: models.Meeting) -> str:
        return f"meeting-{meeting.id}@{self.domain}"

    def ics(self, meeting: models.Meeting) -> str:
        room = meeting.booking.room.name if meeting.booking and meeting.booking.room else "Chưa đặt phòng"
        description = meeting.description or ""
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//ICTU//Meeting Management//VI",
            "CALSCALE:GREGORIAN",
            f"METHOD:{'CANCEL' if meeting.status == models.MeetingStatus.CANCELLED else 'PUBLISH'}",
            "BEGIN:VEVENT",
            f"UID:{self.uid(meeting)}",
            f"DTSTAMP:{_utc_stamp(meeting.updated_at)}",
            f"CREATED:{_utc_stamp(meeting.created_at)}",
            f"LAST-MODIFIED:{_utc_stamp(meeting.updated_at)}",
            f"SEQUENCE:{int(_aware(meeting.updated_at).timestamp() * 1_000_000)}",
            f"DTSTART:{_utc_stamp(meeting.start_time)}",
            f"DTEND:{_utc_stamp(meeting.end_time)}",
            f"SUMMARY:{_escape(meeting.title)}",
            f"DESCRIPTION:{_escape(description)}",
            f"LOCATION:{_escape(room)}",
            f"ORGANIZER:mailto:{meeting.organizer_email}",
            f"STATUS:{'CANCELLED' if meeting.status == models.MeetingStatus.CANCELLED else 'CONFIRMED'}",
        ]
        lines.extend(f"ATTENDEE:mailto:{participant.email}" for participant in meeting.participants)
        lines.extend(["END:VEVENT", "END:VCALENDAR"])
        folded = [part for line in lines for part in _fold(line)]
        return "\r\n".join(folded) + "\r\n"

    def google_url(self, meeting: models.Meeting) -> str:
        room = meeting.booking.room.name if meeting.booking and meeting.booking.room else ""
        details = meeting.description or ""
        if meeting.participants:
            details += "\nNgười tham dự: " + ", ".join(item.email for item in meeting.participants)
        params = {
            "action": "TEMPLATE",
            "text": meeting.title,
            "dates": f"{_utc_stamp(meeting.start_time)}/{_utc_stamp(meeting.end_time)}",
            "details": details,
            "location": room,
            "add": [item.email for item in meeting.participants],
        }
        return "https://calendar.google.com/calendar/render?" + urlencode(params, doseq=True)


calendar_provider = CalendarProvider()
