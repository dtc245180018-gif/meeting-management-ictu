from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import BookingStatus, EquipmentStatus, InvitationStatus, MeetingStatus, NotificationStatus


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    status: InvitationStatus


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int
    location: str
    building: str
    floor: int
    room_type: str
    projector: bool
    display: bool
    microphone: bool
    video_conferencing: bool
    is_active: bool


class RoomAdminCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    capacity: int = Field(gt=0, le=10000)
    location: str = Field(min_length=2, max_length=255)
    building: str = Field(default="", max_length=120)
    floor: int = Field(default=1, ge=0, le=200)
    room_type: str = Field(default="Phòng họp", min_length=2, max_length=80)
    projector: bool = False
    display: bool = False
    microphone: bool = False
    video_conferencing: bool = False

    @field_validator("name", "location", "building", "room_type", mode="before")
    @classmethod
    def strip_room_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class RoomAdminUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    name: str | None = Field(default=None, min_length=2, max_length=120)
    capacity: int | None = Field(default=None, gt=0, le=10000)
    location: str | None = Field(default=None, min_length=2, max_length=255)
    building: str | None = Field(default=None, max_length=120)
    floor: int | None = Field(default=None, ge=0, le=200)
    room_type: str | None = Field(default=None, min_length=2, max_length=80)
    projector: bool | None = None
    display: bool | None = None
    microphone: bool | None = None
    video_conferencing: bool | None = None
    is_active: bool | None = None


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    category: str
    location: str
    status: Literal["available", "booked", "maintenance", "inactive"]
    is_active: bool


class EquipmentBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    meeting_id: int
    start_time: datetime
    end_time: datetime
    status: BookingStatus
    equipment: EquipmentOut


class EquipmentAdminCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=255)
    status: EquipmentStatus = EquipmentStatus.AVAILABLE

    @field_validator("code", "name", "category", "location", mode="before")
    @classmethod
    def normalize_equipment_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class EquipmentAdminUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    code: str | None = Field(default=None, min_length=2, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    category: str | None = Field(default=None, min_length=2, max_length=80)
    location: str | None = Field(default=None, min_length=2, max_length=255)
    status: EquipmentStatus | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    department: str
    is_active: bool


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    meeting_id: int
    start_time: datetime
    end_time: datetime
    status: BookingStatus
    room: RoomOut


class MeetingBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    organizer_email: EmailStr
    start_time: datetime
    end_time: datetime
    participant_emails: list[EmailStr] = Field(default_factory=list, max_length=50)
    expected_attendees: int = Field(default=1, ge=1, le=10000)

    @model_validator(mode="before")
    @classmethod
    def default_expected_attendees(cls, value):
        if isinstance(value, dict) and "expected_attendees" not in value:
            organizer = str(value.get("organizer_email", "")).strip().lower()
            participants = {
                str(email).strip().lower()
                for email in value.get("participant_emails", [])
                if str(email).strip().lower() != organizer
            }
            value = {**value, "expected_attendees": len(participants) + 1}
        return value

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Tiêu đề phải có ít nhất 3 ký tự sau khi bỏ khoảng trắng")
        return value

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        organizer = str(self.organizer_email).strip().lower()
        unique_people = {
            str(email).strip().lower()
            for email in self.participant_emails
            if str(email).strip().lower() != organizer
        }
        if self.expected_attendees < len(unique_people) + 1:
            raise ValueError("Số người dự kiến phải ít nhất bằng số người được mời và người tổ chức")
        return self


class MeetingCreate(MeetingBase):
    recurrence: Literal["weekly", "monthly"] | None = None
    recurrence_count: int = Field(default=1, ge=1, le=24)
    room_id: int | None = Field(default=None, ge=1)
    equipment_ids: list[int] = Field(default_factory=list, max_length=30)
    reminder_minutes: Literal[15, 30, 60, 1440] | None = None

    @field_validator("equipment_ids")
    @classmethod
    def equipment_must_be_unique(cls, value: list[int]) -> list[int]:
        if any(item < 1 for item in value):
            raise ValueError("Mã thiết bị không hợp lệ")
        if len(value) != len(set(value)):
            raise ValueError("Không được chọn trùng thiết bị")
        return value


class MeetingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_time: datetime | None = None
    end_time: datetime | None = None
    participant_emails: list[EmailStr] | None = Field(default=None, max_length=50)
    expected_attendees: int | None = Field(default=None, ge=1, le=10000)
    equipment_ids: list[int] | None = Field(default=None, max_length=30)
    reminder_minutes: Literal[15, 30, 60, 1440] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Tiêu đề phải có ít nhất 3 ký tự sau khi bỏ khoảng trắng")
        return value

    @field_validator("equipment_ids")
    @classmethod
    def update_equipment_must_be_unique(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and (any(item < 1 for item in value) or len(value) != len(set(value))):
            raise ValueError("Danh sách thiết bị không hợp lệ hoặc bị trùng")
        return value


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    organizer_email: EmailStr
    expected_attendees: int
    start_time: datetime
    end_time: datetime
    recurrence: str | None
    recurrence_group: str | None
    status: MeetingStatus
    participants: list[ParticipantOut]
    booking: BookingOut | None = None
    equipment_bookings: list[EquipmentBookingOut] = Field(default_factory=list)


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr


class SuggestedTimeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    participant_emails: list[EmailStr] = Field(min_length=1, max_length=50)
    range_start: datetime
    range_end: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    workday_start_hour: int = Field(default=8, ge=0, le=23)
    workday_end_hour: int = Field(default=17, ge=1, le=24)
    limit: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def validate_range(self):
        if self.range_end <= self.range_start:
            raise ValueError("Khoảng tìm kiếm không hợp lệ")
        if self.workday_end_hour <= self.workday_start_hour:
            raise ValueError("Giờ kết thúc ngày làm việc phải lớn hơn giờ bắt đầu")
        return self


class SuggestedTimeOut(BaseModel):
    start_time: datetime
    end_time: datetime


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    room_id: int
    meeting_id: int
    requester_email: EmailStr


class MessageOut(BaseModel):
    message: str


class CalendarLinksOut(BaseModel):
    google_url: str
    outlook_ics_url: str


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    recipient_email: EmailStr
    channel: str
    remind_at: datetime
    status: NotificationStatus
    attempts: int
    error_message: str | None
    is_read: bool
    created_at: datetime
    sent_at: datetime | None
    meeting_title: str | None = None


class NotificationReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
