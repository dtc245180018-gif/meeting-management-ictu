from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

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
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    organizer_email: EmailStr
    start_time: datetime
    end_time: datetime
    participant_emails: list[EmailStr] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        return self


class MeetingCreate(MeetingBase):
    recurrence: Literal["weekly", "monthly"] | None = None
    recurrence_count: int = Field(default=1, ge=1, le=24)


class MeetingUpdate(BaseModel):
    requester_email: EmailStr
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_time: datetime | None = None
    end_time: datetime | None = None
    participant_emails: list[EmailStr] | None = Field(default=None, max_length=50)


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    organizer_email: EmailStr
    start_time: datetime
    end_time: datetime
    recurrence: str | None
    recurrence_group: str | None
    status: MeetingStatus
    participants: list[ParticipantOut]
    booking: BookingOut | None = None


class CancelRequest(BaseModel):
    requester_email: EmailStr


class SuggestedTimeRequest(BaseModel):
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
    room_id: int
    meeting_id: int
    requester_email: EmailStr


class MessageOut(BaseModel):
    message: str

