from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from contextlib import ExitStack
from threading import Lock
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from . import models, reminders, schemas
from .config import get_settings


# PostgreSQL row locks provide the cross-process guarantee in production. The
# in-process lock also makes the same invariant hold for SQLite development and
# concurrent TestClient requests, where SELECT FOR UPDATE is not supported.
_room_locks: defaultdict[int, Lock] = defaultdict(Lock)
_equipment_locks: defaultdict[int, Lock] = defaultdict(Lock)


def meeting_query():
    return select(models.Meeting).options(
        selectinload(models.Meeting.participants),
        selectinload(models.Meeting.booking).selectinload(models.RoomBooking.room),
        selectinload(models.Meeting.equipment_bookings).selectinload(models.EquipmentBooking.equipment),
        selectinload(models.Meeting.reminders),
        selectinload(models.Meeting.google_calendar_event),
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


def add_month(value: datetime, anchor_day: int | None = None) -> datetime:
    month = value.month + 1
    year = value.year
    if month == 13:
        month = 1
        year += 1
    day = min(anchor_day or value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def recurrence_times(payload: schemas.MeetingCreate) -> list[tuple[datetime, datetime]]:
    times = [(payload.start_time, payload.end_time)]
    if not payload.recurrence or payload.recurrence_count == 1:
        return times

    start = payload.start_time
    end = payload.end_time
    start_anchor_day = start.day
    end_anchor_day = end.day
    for _ in range(1, payload.recurrence_count):
        if payload.recurrence == "weekly":
            start += timedelta(weeks=1)
            end += timedelta(weeks=1)
        else:
            # Always calculate from the original day-of-month. Without the
            # anchor, Jan 31 -> Feb 28 would drift to Mar 28 instead of Mar 31.
            start = add_month(start, start_anchor_day)
            end = add_month(end, end_anchor_day)
        times.append((start, end))
    return times


def ensure_no_occurrence_overlaps(occurrences: list[tuple[datetime, datetime]]) -> None:
    for index, (start_time, end_time) in enumerate(occurrences):
        if any(
            start_time < previous_end and end_time > previous_start
            for previous_start, previous_end in occurrences[:index]
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Các lần lặp của cuộc họp bị chồng chéo thời gian",
            )


def create_meetings(db: Session, payload: schemas.MeetingCreate) -> list[models.Meeting]:
    # Locks are acquired in a deterministic order. PostgreSQL row locks provide
    # the production guarantee; these locks keep SQLite/TestClient atomic too.
    with ExitStack() as stack:
        if payload.room_id is not None:
            stack.enter_context(_room_locks[payload.room_id])
        for equipment_id in sorted(payload.equipment_ids):
            stack.enter_context(_equipment_locks[equipment_id])

        participant_emails = normalize_emails([str(email) for email in payload.participant_emails], str(payload.organizer_email))
        people = [str(payload.organizer_email).lower(), *participant_emails]
        occurrences = recurrence_times(payload)
        ensure_no_occurrence_overlaps(occurrences)
        for start_time, end_time in occurrences:
            ensure_no_person_conflicts(db, people, start_time, end_time)

        room: models.Room | None = None
        if payload.room_id is not None:
            room = db.scalar(
                select(models.Room)
                .where(models.Room.id == payload.room_id)
                .with_for_update()
            )
            if not room or not room.is_active:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng họp")
            required_capacity = max(payload.expected_attendees, len(participant_emails) + 1)
            if room.capacity < required_capacity:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sức chứa phòng không đủ")

            # Check every recurrence before adding any meeting or booking.
            for index, (start_time, end_time) in enumerate(occurrences):
                ensure_room_available(db, room.id, start_time, end_time)

        equipment_items: list[models.Equipment] = []
        if payload.equipment_ids:
            equipment_items = list(
                db.scalars(
                    select(models.Equipment)
                    .where(models.Equipment.id.in_(payload.equipment_ids))
                    .order_by(models.Equipment.id)
                    .with_for_update()
                ).all()
            )
            if len(equipment_items) != len(payload.equipment_ids):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thiết bị")
            for equipment in equipment_items:
                if not equipment.is_active or equipment.status == models.EquipmentStatus.INACTIVE:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Thiết bị {equipment.code} đã bị khóa")
                if equipment.status == models.EquipmentStatus.MAINTENANCE:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Thiết bị {equipment.code} đang bảo trì")
                for start_time, end_time in occurrences:
                    ensure_equipment_available(db, equipment.id, start_time, end_time)

        recurrence_group = uuid4().hex if len(occurrences) > 1 else None
        meetings: list[models.Meeting] = []
        for start_time, end_time in occurrences:
            meeting = models.Meeting(
                title=payload.title.strip(),
                description=payload.description,
                organizer_email=str(payload.organizer_email).lower(),
                expected_attendees=payload.expected_attendees,
                start_time=start_time,
                end_time=end_time,
                recurrence=payload.recurrence,
                recurrence_group=recurrence_group,
                participants=[models.Participant(email=email) for email in participant_emails],
            )
            db.add(meeting)
            meetings.append(meeting)
            if room is not None:
                meeting.booking = models.RoomBooking(
                    room=room,
                    start_time=start_time,
                    end_time=end_time,
                )
            meeting.equipment_bookings = [
                models.EquipmentBooking(
                    equipment_id=equipment.id,
                    start_time=start_time,
                    end_time=end_time,
                )
                for equipment in equipment_items
            ]
            reminders.add_meeting_reminders(
                meeting,
                people,
                payload.reminder_minutes,
            )

        # IDs are required for durable notification idempotency keys. Flushing
        # still keeps meetings, bookings and notifications inside one commit.
        db.flush()
        for meeting in meetings:
            reminders.add_invitation_notifications(meeting, participant_emails)
            reminders.sync_meeting_starting_notifications(meeting, people)

        # One commit for meetings, rooms, equipment and reminders.
        db.commit()
        ids = [meeting.id for meeting in meetings]
        return list(db.scalars(meeting_query().where(models.Meeting.id.in_(ids)).order_by(models.Meeting.start_time)).all())


def update_meeting(db: Session, meeting_id: int, payload: schemas.MeetingUpdate) -> models.Meeting:
    meeting = get_meeting_or_404(db, meeting_id)
    if meeting.organizer_email != str(payload.requester_email).lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo mới được sửa cuộc họp")
    if meeting.status == models.MeetingStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể sửa cuộc họp đã hủy")

    old_start = meeting.start_time
    old_participant_emails = {participant.email for participant in meeting.participants}
    new_start = payload.start_time or meeting.start_time
    new_end = payload.end_time or meeting.end_time
    if new_end <= new_start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Thời gian kết thúc phải sau thời gian bắt đầu")

    participant_emails = (
        normalize_emails([str(email) for email in payload.participant_emails], meeting.organizer_email)
        if payload.participant_emails is not None
        else [participant.email for participant in meeting.participants]
    )
    minimum_attendees = len(participant_emails) + 1
    expected_attendees = (
        payload.expected_attendees
        if payload.expected_attendees is not None
        else max(meeting.expected_attendees, minimum_attendees)
    )
    if payload.expected_attendees is not None and expected_attendees < minimum_attendees:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Số người dự kiến phải ít nhất bằng số người được mời và người tổ chức",
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
    if meeting.booking and meeting.booking.status == models.BookingStatus.ACTIVE:
        room = db.get(models.Room, meeting.booking.room_id)
        if room and room.capacity < expected_attendees:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sức chứa phòng đang đặt không đủ; hãy đổi phòng trước khi cập nhật quy mô cuộc họp",
            )

    active_equipment_bookings = [
        item for item in meeting.equipment_bookings if item.status == models.BookingStatus.ACTIVE
    ]
    if payload.equipment_ids is None:
        for item in active_equipment_bookings:
            if new_start != meeting.start_time or new_end != meeting.end_time:
                ensure_equipment_available(
                    db,
                    item.equipment_id,
                    new_start,
                    new_end,
                    exclude_booking_id=item.id,
                )
                item.start_time = new_start
                item.end_time = new_end
    else:
        desired_ids = set(payload.equipment_ids)
        equipment_items = list(
            db.scalars(
                select(models.Equipment)
                .where(models.Equipment.id.in_(desired_ids))
                .order_by(models.Equipment.id)
                .with_for_update()
            ).all()
        ) if desired_ids else []
        if len(equipment_items) != len(desired_ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thiết bị")
        existing_by_equipment = {item.equipment_id: item for item in meeting.equipment_bookings}
        for equipment in equipment_items:
            if not equipment.is_active or equipment.status == models.EquipmentStatus.INACTIVE:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Thiết bị {equipment.code} đã bị khóa")
            if equipment.status == models.EquipmentStatus.MAINTENANCE:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Thiết bị {equipment.code} đang bảo trì")
            existing = existing_by_equipment.get(equipment.id)
            ensure_equipment_available(
                db,
                equipment.id,
                new_start,
                new_end,
                exclude_booking_id=existing.id if existing else None,
            )
        for item in meeting.equipment_bookings:
            if item.equipment_id not in desired_ids:
                item.status = models.BookingStatus.CANCELLED
        for equipment in equipment_items:
            existing = existing_by_equipment.get(equipment.id)
            if existing:
                existing.status = models.BookingStatus.ACTIVE
                existing.start_time = new_start
                existing.end_time = new_end
            else:
                meeting.equipment_bookings.append(
                    models.EquipmentBooking(
                        equipment_id=equipment.id,
                        start_time=new_start,
                        end_time=new_end,
                    )
                )

    if payload.title is not None:
        meeting.title = payload.title.strip()
    if payload.description is not None:
        meeting.description = payload.description
    meeting.start_time = new_start
    meeting.end_time = new_end
    meeting.expected_attendees = expected_attendees
    if payload.participant_emails is not None:
        desired_emails = set(participant_emails)
        existing_emails = {participant.email for participant in meeting.participants}
        for participant in list(meeting.participants):
            if participant.email not in desired_emails:
                db.delete(participant)
                meeting.participants.remove(participant)
        # Flush removals before adding replacement rows. This avoids the
        # transient UNIQUE(meeting_id, email) violation that caused HTTP 500.
        db.flush()
        meeting.participants.extend(
            models.Participant(email=email)
            for email in participant_emails
            if email not in existing_emails
        )

    reminder_field_supplied = "reminder_minutes" in payload.model_fields_set
    if reminder_field_supplied and payload.reminder_minutes is None:
        reminders.cancel_pending_reminders(meeting, {models.NotificationKind.REMINDER})
    else:
        reminders.sync_pending_reminders(
            meeting,
            [meeting.organizer_email, *participant_emails],
            old_start,
            payload.reminder_minutes,
        )

    reminders.sync_meeting_starting_notifications(
        meeting,
        [meeting.organizer_email, *participant_emails],
    )

    notification_changes = payload.model_fields_set - {"requester_email", "reminder_minutes"}
    if notification_changes:
        current_emails = set(participant_emails)
        added_emails = sorted(current_emails - old_participant_emails)
        removed_emails = sorted(old_participant_emails - current_emails)
        reminders.add_invitation_notifications(meeting, added_emails)
        reminders.add_update_notifications(
            meeting,
            sorted(current_emails - set(added_emails)),
            removed_emails,
        )

    db.commit()
    return get_meeting_or_404(db, meeting_id)


def cancel_meeting(db: Session, meeting_id: int, requester_email: str) -> models.Meeting:
    meeting = get_meeting_or_404(db, meeting_id)
    if meeting.organizer_email != requester_email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo mới được hủy cuộc họp")
    meeting.status = models.MeetingStatus.CANCELLED
    if meeting.booking:
        meeting.booking.status = models.BookingStatus.CANCELLED
    for booking in meeting.equipment_bookings:
        booking.status = models.BookingStatus.CANCELLED
    reminders.cancel_pending_reminders(meeting)
    reminders.add_cancellation_notifications(
        meeting,
        [participant.email for participant in meeting.participants],
    )
    db.commit()
    return get_meeting_or_404(db, meeting_id)


def respond_to_invitation(
    db: Session,
    meeting_id: int,
    email: str,
    response: models.InvitationStatus,
) -> models.Meeting:
    meeting = get_meeting_or_404(db, meeting_id)
    if meeting.status != models.MeetingStatus.SCHEDULED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể phản hồi cuộc họp đã hủy")
    normalized = email.strip().lower()
    participant = next((item for item in meeting.participants if item.email == normalized), None)
    if participant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có lời mời trong cuộc họp này")
    if response not in {models.InvitationStatus.ACCEPTED, models.InvitationStatus.DECLINED}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Trạng thái phản hồi không hợp lệ")
    participant.status = response
    active_recipients = [
        meeting.organizer_email,
        *(item.email for item in meeting.participants if item.status != models.InvitationStatus.DECLINED),
    ]
    reminders.sync_pending_reminders(meeting, active_recipients, meeting.start_time)
    reminders.sync_meeting_starting_notifications(meeting, active_recipients)
    reminders.add_response_notification(meeting, normalized, response)
    db.commit()
    return get_meeting_or_404(db, meeting_id)


def list_history(
    db: Session,
    email: str,
    status_filter: models.MeetingStatus | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    offset: int = 0,
    limit: int = 100,
) -> list[models.Meeting]:
    normalized = email.lower()
    filters = [or_(models.Meeting.organizer_email == normalized, models.Participant.email == normalized)]
    if status_filter is not None:
        filters.append(models.Meeting.status == status_filter)
    if date_from is not None:
        filters.append(models.Meeting.start_time >= date_from)
    if date_to is not None:
        filters.append(models.Meeting.start_time <= date_to)
    stmt = (
        meeting_query()
        .outerjoin(models.Participant)
        .where(*filters)
        .distinct()
        .order_by(models.Meeting.start_time.desc())
        .offset(offset)
        .limit(limit)
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
    with _room_locks[payload.room_id]:
        meeting = get_meeting_or_404(db, payload.meeting_id)
        if meeting.organizer_email != str(payload.requester_email).lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tạo cuộc họp mới được đặt phòng")
        if meeting.status != models.MeetingStatus.SCHEDULED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể đặt phòng cho cuộc họp đã hủy")
        room = db.scalar(
            select(models.Room)
            .where(models.Room.id == payload.room_id)
            .with_for_update()
        )
        if not room or not room.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng họp")
        if meeting.booking and meeting.booking.status == models.BookingStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cuộc họp đã có phòng")
        required_capacity = max(meeting.expected_attendees, len(meeting.participants) + 1)
        if room.capacity < required_capacity:
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


def require_admin(requester_email: str) -> str:
    normalized = requester_email.strip().lower()
    if normalized not in get_settings().admin_email_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ quản trị viên được thực hiện thao tác này")
    return normalized


def list_admin_rooms(db: Session, requester_email: str) -> list[models.Room]:
    require_admin(requester_email)
    return list(db.scalars(select(models.Room).order_by(models.Room.name)).all())


def create_admin_room(db: Session, payload: schemas.RoomAdminCreate) -> models.Room:
    require_admin(str(payload.requester_email))
    name = payload.name.strip()
    if db.scalar(select(models.Room.id).where(func.lower(models.Room.name) == name.lower())):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên phòng đã tồn tại")
    data = payload.model_dump(exclude={"requester_email"})
    data["name"] = name
    room = models.Room(**data)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def update_admin_room(db: Session, room_id: int, payload: schemas.RoomAdminUpdate) -> models.Room:
    require_admin(str(payload.requester_email))
    room = db.get(models.Room, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng họp")
    values = payload.model_dump(exclude_unset=True, exclude={"requester_email"})
    if "name" in values:
        values["name"] = values["name"].strip()
        duplicate = db.scalar(
            select(models.Room.id).where(
                func.lower(models.Room.name) == values["name"].lower(),
                models.Room.id != room_id,
            )
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên phòng đã tồn tại")
    for key, value in values.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(room, key, value)
    db.commit()
    db.refresh(room)
    return room


def deactivate_admin_room(db: Session, room_id: int, requester_email: str) -> models.Room:
    require_admin(requester_email)
    room = db.get(models.Room, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phòng họp")
    room.is_active = False
    db.commit()
    db.refresh(room)
    return room


def ensure_equipment_available(
    db: Session,
    equipment_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_booking_id: int | None = None,
) -> None:
    stmt = select(models.EquipmentBooking.id).where(
        models.EquipmentBooking.equipment_id == equipment_id,
        models.EquipmentBooking.status == models.BookingStatus.ACTIVE,
        models.EquipmentBooking.start_time < end_time,
        models.EquipmentBooking.end_time > start_time,
    )
    if exclude_booking_id:
        stmt = stmt.where(models.EquipmentBooking.id != exclude_booking_id)
    if db.scalar(stmt.limit(1)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Thiết bị đã được đặt trong khung giờ này")


def equipment_status_for_window(
    db: Session,
    equipment: models.Equipment,
    start_time: datetime | None,
    end_time: datetime | None,
) -> str:
    if not equipment.is_active or equipment.status == models.EquipmentStatus.INACTIVE:
        return "inactive"
    if equipment.status == models.EquipmentStatus.MAINTENANCE:
        return "maintenance"
    if start_time is not None and end_time is not None:
        occupied = db.scalar(
            select(models.EquipmentBooking.id).where(
                models.EquipmentBooking.equipment_id == equipment.id,
                models.EquipmentBooking.status == models.BookingStatus.ACTIVE,
                models.EquipmentBooking.start_time < end_time,
                models.EquipmentBooking.end_time > start_time,
            ).limit(1)
        )
        if occupied:
            return "booked"
    return "available"


def equipment_to_out(db: Session, equipment: models.Equipment, start_time=None, end_time=None) -> schemas.EquipmentOut:
    return schemas.EquipmentOut(
        id=equipment.id,
        code=equipment.code,
        name=equipment.name,
        category=equipment.category,
        location=equipment.location,
        status=equipment_status_for_window(db, equipment, start_time, end_time),
        is_active=equipment.is_active,
    )


def list_equipment(
    db: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    category: str | None = None,
    status_filter: str | None = None,
    include_inactive: bool = True,
) -> list[schemas.EquipmentOut]:
    if (start_time is None) != (end_time is None):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Phải nhập đủ thời gian bắt đầu và kết thúc")
    if start_time and end_time and end_time <= start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Khoảng thời gian không hợp lệ")
    stmt = select(models.Equipment)
    if category:
        stmt = stmt.where(models.Equipment.category == category)
    if not include_inactive:
        stmt = stmt.where(models.Equipment.is_active.is_(True))
    items = [equipment_to_out(db, item, start_time, end_time) for item in db.scalars(stmt.order_by(models.Equipment.code)).all()]
    if status_filter:
        items = [item for item in items if item.status == status_filter]
    return items


def create_admin_equipment(db: Session, payload: schemas.EquipmentAdminCreate) -> schemas.EquipmentOut:
    require_admin(str(payload.requester_email))
    code = payload.code.upper().strip()
    if db.scalar(select(models.Equipment.id).where(func.lower(models.Equipment.code) == code.lower())):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mã thiết bị đã tồn tại")
    data = payload.model_dump(exclude={"requester_email"})
    data["code"] = code
    equipment = models.Equipment(**data, is_active=payload.status != models.EquipmentStatus.INACTIVE)
    db.add(equipment)
    db.commit()
    db.refresh(equipment)
    return equipment_to_out(db, equipment)


def update_admin_equipment(
    db: Session,
    equipment_id: int,
    payload: schemas.EquipmentAdminUpdate,
) -> schemas.EquipmentOut:
    require_admin(str(payload.requester_email))
    equipment = db.get(models.Equipment, equipment_id)
    if not equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thiết bị")
    values = payload.model_dump(exclude_unset=True, exclude={"requester_email"})
    if "code" in values:
        values["code"] = values["code"].upper().strip()
        duplicate = db.scalar(
            select(models.Equipment.id).where(
                func.lower(models.Equipment.code) == values["code"].lower(),
                models.Equipment.id != equipment_id,
            )
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mã thiết bị đã tồn tại")
    target_status = values.get("status")
    target_status_value = target_status.value if isinstance(target_status, models.EquipmentStatus) else target_status
    if target_status_value == models.EquipmentStatus.MAINTENANCE.value:
        # SQLite strips tzinfo while retaining UTC clock values; always query
        # with UTC so tests/dev and PostgreSQL evaluate the same instant.
        now = datetime.now(timezone.utc)
        active_now = db.scalar(
            select(models.EquipmentBooking.id).where(
                models.EquipmentBooking.equipment_id == equipment_id,
                models.EquipmentBooking.status == models.BookingStatus.ACTIVE,
                models.EquipmentBooking.start_time <= now,
                models.EquipmentBooking.end_time > now,
            ).limit(1)
        )
        if active_now:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể bảo trì thiết bị đang được sử dụng")
    for key, value in values.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(equipment, key, value)
    if equipment.status == models.EquipmentStatus.INACTIVE:
        equipment.is_active = False
    elif "status" in values and "is_active" not in values:
        equipment.is_active = True
    db.commit()
    db.refresh(equipment)
    return equipment_to_out(db, equipment)


def deactivate_admin_equipment(db: Session, equipment_id: int, requester_email: str) -> schemas.EquipmentOut:
    require_admin(requester_email)
    equipment = db.get(models.Equipment, equipment_id)
    if not equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thiết bị")
    equipment.is_active = False
    equipment.status = models.EquipmentStatus.INACTIVE
    db.commit()
    db.refresh(equipment)
    return equipment_to_out(db, equipment)


def list_notifications(db: Session, email: str) -> list[schemas.NotificationOut]:
    normalized = email.strip().lower()
    now = datetime.now(timezone.utc)
    items = list(
        db.scalars(
            select(models.Reminder)
            .options(
                selectinload(models.Reminder.meeting)
                .selectinload(models.Meeting.booking)
                .selectinload(models.RoomBooking.room)
            )
            .where(
                models.Reminder.recipient_email == normalized,
                or_(
                    models.Reminder.kind != models.NotificationKind.MEETING_STARTING,
                    models.Reminder.remind_at <= now,
                ),
            )
            .order_by(models.Reminder.remind_at.desc())
        ).all()
    )
    return [
        schemas.NotificationOut(
            id=item.id,
            meeting_id=item.meeting_id,
            recipient_email=item.recipient_email,
            channel=item.channel,
            kind=item.kind,
            subject=item.subject,
            body=item.body,
            remind_at=item.remind_at,
            status=item.status,
            attempts=item.attempts,
            error_message=item.error_message,
            is_read=item.is_read,
            created_at=item.created_at,
            sent_at=item.sent_at,
            meeting_title=item.meeting.title,
            meeting_start_time=item.meeting.start_time,
            meeting_end_time=item.meeting.end_time,
            room_name=item.meeting.booking.room.name if item.meeting.booking and item.meeting.booking.room else None,
        )
        for item in items
    ]


def mark_notification_read(db: Session, notification_id: int, email: str) -> schemas.NotificationOut:
    item = db.scalar(
        select(models.Reminder)
        .options(selectinload(models.Reminder.meeting))
        .where(models.Reminder.id == notification_id)
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")
    if item.recipient_email != email.strip().lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền đọc thông báo này")
    item.is_read = True
    db.commit()
    db.refresh(item)
    return schemas.NotificationOut(
        id=item.id,
        meeting_id=item.meeting_id,
        recipient_email=item.recipient_email,
        channel=item.channel,
        kind=item.kind,
        subject=item.subject,
        body=item.body,
        remind_at=item.remind_at,
        status=item.status,
        attempts=item.attempts,
        error_message=item.error_message,
        is_read=item.is_read,
        created_at=item.created_at,
        sent_at=item.sent_at,
        meeting_title=item.meeting.title,
        meeting_start_time=item.meeting.start_time,
        meeting_end_time=item.meeting.end_time,
        room_name=item.meeting.booking.room.name if item.meeting.booking and item.meeting.booking.room else None,
    )
