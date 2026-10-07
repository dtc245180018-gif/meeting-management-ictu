from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base


class UTCDateTime(TypeDecorator):
    """Store UTC and restore timezone metadata that SQLite cannot preserve."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name != "sqlite"))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, _dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class MeetingStatus(StrEnum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"


class InvitationStatus(StrEnum):
    INVITED = "invited"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class BookingStatus(StrEnum):
    ACTIVE = "active"
    CANCELLED = "cancelled"


class EquipmentStatus(StrEnum):
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"
    INACTIVE = "inactive"


class NotificationStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class NotificationKind(StrEnum):
    REMINDER = "reminder"
    MEETING_STARTING = "meeting_starting"
    INVITATION = "invitation"
    MEETING_UPDATED = "meeting_updated"
    MEETING_CANCELLED = "meeting_cancelled"
    INVITATION_RESPONSE = "invitation_response"


class GoogleSyncStatus(StrEnum):
    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"
    DELETED = "deleted"


class AccountRole(StrEnum):
    ADMIN = "admin"
    ORGANIZER = "organizer"
    # Backward-compatible Python alias for Sprint 2 code/tests. Persisted
    # ``EMPLOYEE`` values are migrated to ``ORGANIZER`` on startup.
    EMPLOYEE = "organizer"
    PARTICIPANT = "participant"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    organizer_email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    expected_attendees: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    recurrence: Mapped[str | None] = mapped_column(String(20))
    recurrence_group: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[MeetingStatus] = mapped_column(Enum(MeetingStatus), default=MeetingStatus.SCHEDULED, nullable=False)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    participants: Mapped[list[Participant]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    booking: Mapped[RoomBooking | None] = relationship(back_populates="meeting", uselist=False)
    equipment_bookings: Mapped[list[EquipmentBooking]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    reminders: Mapped[list[Reminder]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    google_calendar_event: Mapped[GoogleCalendarEvent | None] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", uselist=False
    )


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("meeting_id", "email", name="uq_meeting_participant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(Enum(InvitationStatus), default=InvitationStatus.INVITED, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("email", name="uq_employee_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(160), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    account: Mapped[UserAccount | None] = relationship(
        back_populates="employee", cascade="all, delete-orphan", uselist=False
    )


class UserAccount(Base):
    """Login account linked one-to-one with an ICTU employee."""

    __tablename__ = "user_accounts"
    __table_args__ = (
        UniqueConstraint("employee_id", name="uq_user_account_employee"),
        UniqueConstraint("email", name="uq_user_account_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[AccountRole] = mapped_column(
        Enum(AccountRole), default=AccountRole.ORGANIZER, nullable=False
    )
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    password_changed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    employee: Mapped[Employee] = relationship(back_populates="account")
    room_policies: Mapped[list[RoomAccessPolicy]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    building: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    floor: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    room_type: Mapped[str] = mapped_column(String(80), nullable=False, default="Phòng họp")
    projector: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    microphone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    video_conferencing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    bookings: Mapped[list[RoomBooking]] = relationship(back_populates="room")
    access_policies: Mapped[list[RoomAccessPolicy]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class RoomAccessPolicy(Base):
    """Explicit per-account permission for a room.

    Missing rows mean allowed. This keeps existing installations permissive
    while letting administrators deny or restore individual access.
    """

    __tablename__ = "room_access_policies"
    __table_args__ = (
        UniqueConstraint("account_id", "room_id", name="uq_room_access_account_room"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("user_accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False
    )
    can_book: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )

    account: Mapped[UserAccount] = relationship(back_populates="room_policies")
    room: Mapped[Room] = relationship(back_populates="access_policies")


class AccountAuditLog(Base):
    __tablename__ = "account_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_accounts.id", ondelete="SET NULL"), index=True
    )
    target_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_accounts.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class RoomBooking(Base):
    __tablename__ = "room_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True, nullable=False)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id"), unique=True, nullable=False)
    start_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.ACTIVE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    room: Mapped[Room] = relationship(back_populates="bookings")
    meeting: Mapped[Meeting] = relationship(back_populates="booking")


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[EquipmentStatus] = mapped_column(
        Enum(EquipmentStatus), default=EquipmentStatus.AVAILABLE, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    bookings: Mapped[list[EquipmentBooking]] = relationship(back_populates="equipment")


class EquipmentBooking(Base):
    __tablename__ = "equipment_bookings"
    __table_args__ = (
        UniqueConstraint("equipment_id", "meeting_id", name="uq_equipment_meeting_booking"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True, nullable=False)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True, nullable=False)
    start_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.ACTIVE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    equipment: Mapped[Equipment] = relationship(back_populates="bookings")
    meeting: Mapped[Meeting] = relationship(back_populates="equipment_bookings")


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("meeting_id", "recipient_email", "remind_at", name="uq_meeting_recipient_reminder"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True, nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="email", nullable=False)
    kind: Mapped[NotificationKind] = mapped_column(
        Enum(NotificationKind), default=NotificationKind.REMINDER, nullable=False
    )
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    event_key: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    remind_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        Enum(NotificationStatus), default=NotificationStatus.PENDING, nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    meeting: Mapped[Meeting] = relationship(back_populates="reminders")


class GoogleCalendarConnection(Base):
    __tablename__ = "google_calendar_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    google_email: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary", nullable=False)
    scopes: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    events: Mapped[list[GoogleCalendarEvent]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )


class GoogleCalendarEvent(Base):
    __tablename__ = "google_calendar_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    connection_id: Mapped[int] = mapped_column(
        ForeignKey("google_calendar_connections.id", ondelete="CASCADE"), index=True, nullable=False
    )
    google_event_id: Mapped[str | None] = mapped_column(String(1024))
    html_link: Mapped[str | None] = mapped_column(Text)
    sync_status: Mapped[GoogleSyncStatus] = mapped_column(
        Enum(GoogleSyncStatus), default=GoogleSyncStatus.PENDING, nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    meeting: Mapped[Meeting] = relationship(back_populates="google_calendar_event")
    connection: Mapped[GoogleCalendarConnection] = relationship(back_populates="events")
