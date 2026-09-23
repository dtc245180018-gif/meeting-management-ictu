from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas


def meeting_query():
    return select(models.Meeting).options(
        selectinload(models.Meeting.participants),
        selectinload(models.Meeting.booking).selectinload(models.RoomBooking.room),
    )


def get_meeting_or_404(db: Session, meeting_id: int) -> models.Meeting:
    meeting = db.scalar(meeting_query().where(models.Meeting.id == meeting_id))
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc họp")
    return meeting


def normalize_emails(emails: list[str], organizer_email: str | None = None) -> list[str]:
    normalized = {email.lower().strip() for email in emails}
    if organizer_email:
        normalized.discard(organizer_email.lower().strip())
    return sorted(normalized)


def ensure_no_person_conflicts(
    db: Session,
    emails: list[str],
    start_time: datetime,
    end_time: datetime,
    exclude_meeting_id: int | None = None,
) -> None:
    people = normalize_emails(emails)
    if not people:
        return

    stmt = (
        select(models.Meeting.id)
        .outerjoin(models.Participant)
        .where(
            models.Meeting.status == models.MeetingStatus.SCHEDULED,
            models.Meeting.start_time < end_time,
            models.Meeting.end_time > start_time,
            or_(
                models.Meeting.organizer_email.in_(people),
                models.Participant.email.in_(people),
            ),
        )
        .limit(1)
    )
    if exclude_meeting_id:
        stmt = stmt.where(models.Meeting.id != exclude_meeting_id)
    if db.scalar(stmt):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Một người tham dự đã có lịch trong khung giờ này",
        )


def add_month(value: datetime) -> datetime:
    month = value.month + 1
    year = value.year
    if month == 13:
        month = 1
        year += 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def recurrence_times(payload: schemas.MeetingCreate) -> list[tuple[datetime, datetime]]:
    times = [(payload.start_time, payload.end_time)]
    if not payload.recurrence or payload.recurrence_count == 1:
        return times

    start = payload.start_time
    end = payload.end_time
    for _ in range(1, payload.recurrence_count):
        if payload.recurrence == "weekly":
            start += timedelta(weeks=1)
            end += timedelta(weeks=1)
        else:
            start = add_month(start)
            end = add_month(end)
        times.append((start, end))
    return times


def create_meetings(db: Session, payload: schemas.MeetingCreate) -> list[models.Meeting]:
    participant_emails = normalize_emails([str(email) for email in payload.participant_emails], str(payload.organizer_email))
    people = [str(payload.organizer_email).lower(), *participant_emails]
    occurrences = recurrence_times(payload)
    for start_time, end_time in occurrences:
        ensure_no_person_conflicts(db, people, start_time, end_time)

    recurrence_group = uuid4().hex if len(occurrences) > 1 else None
    meetings: list[models.Meeting] = []
    for start_time, end_time in occurrences:
        meeting = models.Meeting(
            title=payload.title.strip(),
            description=payload.description,
            organizer_email=str(payload.organizer_email).lower(),
            start_time=start_time,
            end_time=end_time,
            recurrence=payload.recurrence,
            recurrence_group=recurrence_group,
            participants=[models.Participant(email=email) for email in participant_emails],
        )
        db.add(meeting)
        meetings.append(meeting)

    db.commit()
    ids = [meeting.id for meeting in meetings]
    return list(db.scalars(meeting_query().where(models.Meeting.id.in_(ids)).order_by(models.Meeting.start_time)).all())


def update_meeting(db: Session, meeting_id: int, payload: schemas.MeetingUpdate) -> models.Meeting:
    meeting = get_meeting_or_404(db, meeting_id)
    if meeting.organizer_email != str(payload.requester_email).lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo mới được sửa cuộc họp")
    if meeting.status == models.MeetingStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể sửa cuộc họp đã hủy")

    new_start = payload.start_time or meeting.start_time
    new_end = payload.end_time or meeting.end_time
    if new_end <= new_start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Thời gian kết thúc phải sau thời gian bắt đầu")

    participant_emails = (
        normalize_emails([str(email) for email in payload.participant_emails], meeting.organizer_email)
        if payload.participant_emails is not None
        else [participant.email for participant in meeting.participants]
    )
    ensure_no_person_conflicts(
        db,
        [meeting.organizer_email, *participant_emails],
        new_start,
        new_end,
        exclude_meeting_id=meeting.id,
    )

    if meeting.booking and (
        new_start != meeting.start_time or new_end != meeting.end_time
    ):
        ensure_room_available(db, meeting.booking.room_id, new_start, new_end, exclude_booking_id=meeting.booking.id)
        meeting.booking.start_time = new_start
        meeting.booking.end_time = new_end

    if payload.title is not None:
        meeting.title = payload.title.strip()
    if payload.description is not None:
        meeting.description = payload.description
    meeting.start_time = new_start
    meeting.end_time = new_end
    if payload.participant_emails is not None:
        meeting.participants.clear()
        meeting.participants.extend(models.Participant(email=email) for email in participant_emails)

    db.commit()
    return get_meeting_or_404(db, meeting_id)


def cancel_meeting(db: Session, meeting_id: int, requester_email: str) -> models.Meeting:
    meeting = get_meeting_or_404(db, meeting_id)
    if meeting.organizer_email != requester_email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo mới được hủy cuộc họp")
    meeting.status = models.MeetingStatus.CANCELLED
    if meeting.booking:
        meeting.booking.status = models.BookingStatus.CANCELLED
    db.commit()
    return get_meeting_or_404(db, meeting_id)


def list_history(db: Session, email: str) -> list[models.Meeting]:
    normalized = email.lower()
    stmt = (
        meeting_query()
        .outerjoin(models.Participant)
        .where(or_(models.Meeting.organizer_email == normalized, models.Participant.email == normalized))
        .distinct()
        .order_by(models.Meeting.start_time.desc())
    )
    return list(db.scalars(stmt).unique().all())


def list_busy_intervals(db: Session, emails: list[str], start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    people = normalize_emails(emails)
    stmt = (
        select(models.Meeting.start_time, models.Meeting.end_time)
        .outerjoin(models.Participant)
        .where(
            models.Meeting.status == models.MeetingStatus.SCHEDULED,
            models.Meeting.start_time < end,
            models.Meeting.end_time > start,
            or_(models.Meeting.organizer_email.in_(people), models.Participant.email.in_(people)),
        )
        .distinct()
        .order_by(models.Meeting.start_time)
    )
    return list(db.execute(stmt).all())


def suggest_times(db: Session, payload: schemas.SuggestedTimeRequest) -> list[schemas.SuggestedTimeOut]:
    busy = list_busy_intervals(
        db,
        [str(email) for email in payload.participant_emails],
        payload.range_start,
        payload.range_end,
    )
    duration = timedelta(minutes=payload.duration_minutes)
    step = timedelta(minutes=30)
    cursor = payload.range_start
    suggestions: list[schemas.SuggestedTimeOut] = []

    while cursor + duration <= payload.range_end and len(suggestions) < payload.limit:
        if cursor.weekday() < 5:
            day_start = cursor.replace(hour=payload.workday_start_hour, minute=0, second=0, microsecond=0)
            day_end = cursor.replace(hour=payload.workday_end_hour % 24, minute=0, second=0, microsecond=0)
            if payload.workday_end_hour == 24:
                day_end = cursor.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
            candidate_start = max(cursor, day_start)
            candidate_end = candidate_start + duration
            if candidate_end <= day_end:
                overlaps = False
                for busy_start, busy_end in busy:
                    # SQLite does not preserve timezone metadata. Align it with
                    # the request timezone before comparing test/dev values.
                    if busy_start.tzinfo is None and candidate_start.tzinfo is not None:
                        busy_start = busy_start.replace(tzinfo=candidate_start.tzinfo)
                        busy_end = busy_end.replace(tzinfo=candidate_start.tzinfo)
                    if busy_start < candidate_end and busy_end > candidate_start:
                        overlaps = True
                        break
                if not overlaps:
                    suggestions.append(schemas.SuggestedTimeOut(start_time=candidate_start, end_time=candidate_end))
                cursor = candidate_start + step
                continue
        next_day = (cursor + timedelta(days=1)).replace(
            hour=payload.workday_start_hour, minute=0, second=0, microsecond=0
        )
        cursor = next_day
    return suggestions


def ensure_room_available(
    db: Session,
    room_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_booking_id: int | None = None,
) -> None:
    stmt = select(models.RoomBooking.id).where(
        models.RoomBooking.room_id == room_id,
        models.RoomBooking.status == models.BookingStatus.ACTIVE,
        models.RoomBooking.start_time < end_time,
        models.RoomBooking.end_time > start_time,
    )
    if exclude_booking_id:
        stmt = stmt.where(models.RoomBooking.id != exclude_booking_id)
    if db.scalar(stmt.limit(1)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phòng đã được đặt trong khung giờ này")


def available_rooms(db: Session, start_time: datetime, end_time: datetime, min_capacity: int) -> list[models.Room]:
    if end_time <= start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Khoảng thời gian không hợp lệ")
    occupied_room_ids = select(models.RoomBooking.room_id).where(
        models.RoomBooking.status == models.BookingStatus.ACTIVE,
        models.RoomBooking.start_time < end_time,
        models.RoomBooking.end_time > start_time,
    )
    stmt = (
        select(models.Room)
        .where(
            models.Room.is_active.is_(True),
            models.Room.capacity >= min_capacity,
            models.Room.id.not_in(occupied_room_ids),
        )
        .order_by(models.Room.capacity, models.Room.name)
    )
    return list(db.scalars(stmt).all())


def create_booking(db: Session, payload: schemas.BookingCreate) -> models.RoomBooking:
    meeting = get_meeting_or_404(db, payload.meeting_id)
    if meeting.organizer_email != str(payload.requester_email).lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo cuộc họp mới được đặt phòng")
    if meeting.status != models.MeetingStatus.SCHEDULED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể đặt phòng cho cuộc họp đã hủy")
    room = db.get(models.Room, payload.room_id)
    if not room or not room.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng họp")
    if meeting.booking and meeting.booking.status == models.BookingStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cuộc họp đã có phòng")
    if room.capacity < len(meeting.participants) + 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sức chứa phòng không đủ")
    ensure_room_available(db, room.id, meeting.start_time, meeting.end_time)

    booking = models.RoomBooking(
        room_id=room.id,
        meeting_id=meeting.id,
        start_time=meeting.start_time,
        end_time=meeting.end_time,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return db.scalar(
        select(models.RoomBooking)
        .options(selectinload(models.RoomBooking.room))
        .where(models.RoomBooking.id == booking.id)
    )
