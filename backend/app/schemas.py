from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import BookingStatus, InvitationStatus, MeetingStatus


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


class MeetingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_time: datetime | None = None
    end_time: datetime | None = None
    participant_emails: list[EmailStr] | None = Field(default=None, max_length=50)
    expected_attendees: int | None = Field(default=None, ge=1, le=10000)

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
