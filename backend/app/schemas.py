from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import (
    AccountRole,
    BookingStatus,
    EquipmentStatus,
    GoogleSyncStatus,
    InvitationStatus,
    MeetingStatus,
    NotificationKind,
    NotificationStatus,
)


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
    can_book: bool = True
    restriction_reason: str | None = None


class RoomRecommendationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_time: datetime
    end_time: datetime
    expected_attendees: int = Field(ge=1, le=10000)
    recurrence: Literal["weekly", "monthly"] | None = None
    recurrence_count: int = Field(default=1, ge=1, le=24)
    equipment_ids: list[int] = Field(default_factory=list, max_length=30)
    required_features: list[Literal["projector", "display", "microphone", "video_conferencing"]] = Field(
        default_factory=list,
        max_length=4,
    )
    preferred_building: str | None = Field(default=None, max_length=120)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=50)

    @field_validator("equipment_ids")
    @classmethod
    def recommendation_equipment_unique(cls, value: list[int]) -> list[int]:
        if any(item < 1 for item in value) or len(value) != len(set(value)):
            raise ValueError("Danh sách thiết bị không hợp lệ hoặc bị trùng")
        return value

    @field_validator("required_features")
    @classmethod
    def recommendation_features_unique(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Không được chọn trùng tính năng phòng")
        return value

    @model_validator(mode="after")
    def recommendation_time_range(self):
        if self.end_time <= self.start_time:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        return self


class RoomRecommendationOut(BaseModel):
    room: RoomOut
    score: int
    reasons: list[str]
    capacity_surplus: int


class RoomRecommendationPage(BaseModel):
    items: list[RoomRecommendationOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    message: str | None = None


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


class EquipmentAdminBulkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    code_prefix: str = Field(min_length=2, max_length=70)
    start_number: int = Field(default=1, ge=1, le=99999)
    quantity: int = Field(ge=1, le=100)
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=255)
    status: EquipmentStatus = EquipmentStatus.AVAILABLE

    @field_validator("code_prefix", "name", "category", "location", mode="before")
    @classmethod
    def normalize_bulk_equipment_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("code_prefix")
    @classmethod
    def uppercase_code_prefix(cls, value: str) -> str:
        return value.upper().rstrip("-")


class EquipmentAdminBulkOut(BaseModel):
    created_count: int
    items: list[EquipmentOut]


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


class BookingAttendanceDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    email: EmailStr
    full_name: str
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    meeting_id: int
    start_time: datetime
    end_time: datetime
    status: BookingStatus
    room: RoomOut
    attendances: list[BookingAttendanceDetailOut] = Field(default_factory=list)


class BookingQrOut(BaseModel):
    booking_id: int
    room_id: int
    expires_at: datetime
    qr_token: str
    image_data_url: str


class BookingQrRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    qr_token: str = Field(min_length=20, max_length=20000)


class BookingQrInspectionOut(BaseModel):
    booking_id: int
    meeting_id: int
    meeting_title: str
    room_id: int
    room_name: str
    start_time: datetime
    end_time: datetime
    meeting_status: MeetingStatus
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    can_check_in: bool
    can_check_out: bool


class BookingAttendanceOut(BaseModel):
    booking_id: int
    account_id: int
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    already_recorded: bool = False
    message: str


class GoogleCalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sync_status: GoogleSyncStatus
    html_link: str | None
    error_message: str | None
    synced_at: datetime | None


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
    cancellation_reason: str | None = None
    participants: list[ParticipantOut]
    booking: BookingOut | None = None
    equipment_bookings: list[EquipmentBookingOut] = Field(default_factory=list)
    google_calendar_event: GoogleCalendarEventOut | None = None


class ChatbotBookingDraft(BaseModel):
    """Partial meeting data collected by the Sprint 4 booking assistant."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    organizer_email: EmailStr | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    participant_emails: list[EmailStr] = Field(default_factory=list, max_length=50)
    expected_attendees: int | None = Field(default=None, ge=1, le=10000)
    recurrence: Literal["weekly", "monthly"] | None = None
    recurrence_count: int = Field(default=1, ge=1, le=24)
    room_id: int | None = Field(default=None, ge=1)
    equipment_ids: list[int] = Field(default_factory=list, max_length=30)
    reminder_minutes: Literal[15, 30, 60, 1440] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_optional_title(cls, value: str | None) -> str | None:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("equipment_ids")
    @classmethod
    def chatbot_equipment_must_be_unique(cls, value: list[int]) -> list[int]:
        if any(item < 1 for item in value) or len(value) != len(set(value)):
            raise ValueError("Danh sách thiết bị không hợp lệ hoặc bị trùng")
        return value

    @model_validator(mode="after")
    def validate_partial_booking(self):
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu")
        organizer = str(self.organizer_email).strip().lower() if self.organizer_email else ""
        participants = {
            str(email).strip().lower()
            for email in self.participant_emails
            if str(email).strip().lower() != organizer
        }
        if (
            self.expected_attendees is not None
            and self.expected_attendees < len(participants) + 1
        ):
            raise ValueError(
                "Số người dự kiến phải ít nhất bằng số người được mời và người tổ chức"
            )
        return self


class ChatbotBookingPreviewOut(BaseModel):
    ready_to_confirm: bool
    prompt: str
    missing_fields: list[str] = Field(default_factory=list)
    draft: ChatbotBookingDraft
    room_options: list[RoomOut] = Field(default_factory=list)
    summary: str | None = None
    confirmation_token: str | None = None
    expires_at: datetime | None = None


class ChatbotBookingConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation_token: str = Field(min_length=20, max_length=20000)


class ChatbotBookingConfirmOut(BaseModel):
    message: str
    meetings: list[MeetingOut]


class ChatbotConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatbotConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    draft: ChatbotBookingDraft
    history: list[ChatbotConversationMessage] = Field(default_factory=list, max_length=12)

    @field_validator("message", mode="before")
    @classmethod
    def normalize_chat_message(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tin nhắn không được để trống")
        return normalized


class ChatbotConversationOut(BaseModel):
    reply: str
    draft: ChatbotBookingDraft
    missing_fields: list[str] = Field(default_factory=list)
    ready_for_preview: bool
    provider: Literal["gemini"] = "gemini"
    model: str


class ChatbotAiStatusOut(BaseModel):
    configured: bool
    provider: Literal["gemini"] = "gemini"
    model: str
    privacy_notice: str


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr
    reason: str | None = Field(default=None, max_length=500)


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


class InvitationResponseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    status: Literal["accepted", "declined"]


class GoogleConnectionStatusOut(BaseModel):
    configured: bool
    connected: bool
    user_email: EmailStr
    google_email: EmailStr | None = None
    connected_at: datetime | None = None
    missing_settings: list[str] = Field(default_factory=list)


class GoogleConnectUrlOut(BaseModel):
    authorization_url: str


class EmailIntegrationStatusOut(BaseModel):
    backend: Literal["console", "smtp"]
    configured: bool
    sender: EmailStr | None = None
    detail: str


class GoogleSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requester_email: EmailStr


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    recipient_email: EmailStr
    channel: str
    kind: NotificationKind = NotificationKind.REMINDER
    subject: str | None = None
    body: str | None = None
    remind_at: datetime
    status: NotificationStatus
    attempts: int
    error_message: str | None
    is_read: bool
    created_at: datetime
    sent_at: datetime | None
    meeting_title: str | None = None
    meeting_start_time: datetime | None = None
    meeting_end_time: datetime | None = None
    room_name: str | None = None
    can_join: bool = False


class NotificationReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


# Sprint 3 authentication, administration and reporting contracts.
class AccountOut(BaseModel):
    id: int
    employee_id: int
    email: EmailStr
    full_name: str
    department: str
    role: AccountRole
    must_change_password: bool
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class LoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: AccountOut


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def passwords_differ(self):
        if self.current_password == self.new_password:
            raise ValueError("Mật khẩu mới phải khác mật khẩu hiện tại")
        return self


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=160)
    department: str = Field(min_length=2, max_length=160)

    @field_validator("full_name", "department", mode="before")
    @classmethod
    def normalize_profile_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class AccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    department: str = Field(min_length=2, max_length=160)
    role: AccountRole = AccountRole.PARTICIPANT


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    department: str | None = Field(default=None, min_length=2, max_length=160)
    role: AccountRole | None = None
    is_active: bool | None = None
    reset_password: bool = False


class AccountPage(BaseModel):
    items: list[AccountOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class HRMEmployeeRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str = Field(min_length=1, max_length=120)
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    department: str = Field(min_length=2, max_length=160)
    is_active: bool = True
    role: AccountRole | None = None

    @field_validator("external_id", "full_name", "department", mode="before")
    @classmethod
    def normalize_hrm_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class HRMSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[dict[str, object]] | None = Field(default=None, max_length=1000)


class HRMSyncIssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    record_key: str | None
    error_code: str
    message: str
    created_at: datetime


class HRMSyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    trigger: str
    status: str
    total_count: int
    created_count: int
    updated_count: int
    skipped_count: int
    failed_count: int
    started_at: datetime
    finished_at: datetime | None
    issues: list[HRMSyncIssueOut] = Field(default_factory=list)


class HRMSyncPage(BaseModel):
    items: list[HRMSyncRunOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class HRMIntegrationStatusOut(BaseModel):
    connector: str
    configured: bool
    running: bool
    periodic_enabled: bool
    detail: str


class RoomPermissionOut(BaseModel):
    account_id: int
    room_id: int
    room_name: str
    can_book: bool
    reason: str | None = None


class RoomPermissionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_book: bool
    reason: str | None = Field(default=None, max_length=300)


class ReportSummary(BaseModel):
    total_meetings: int
    scheduled_meetings: int
    completed_meetings: int
    cancelled_meetings: int
    cancellation_rate: float
    total_bookings: int
    total_booking_minutes: int


class RoomUsageRow(BaseModel):
    room_id: int
    room_name: str
    building: str
    floor: int
    booking_count: int
    booked_minutes: int
    scheduled_count: int
    completed_count: int
    cancelled_count: int


class CancellationTrendRow(BaseModel):
    date: str
    total_count: int
    cancelled_count: int
    cancellation_rate: float


class CancellationReasonRow(BaseModel):
    reason: str
    count: int


class OrganizerCancellationRow(BaseModel):
    organizer_email: EmailStr
    total_count: int
    cancelled_count: int
    cancellation_rate: float


class ReportOverviewOut(BaseModel):
    generated_at: datetime
    timezone: str = "Asia/Ho_Chi_Minh"
    date_from: datetime
    date_to: datetime
    summary: ReportSummary
    room_usage: list[RoomUsageRow]
    cancellation_trend: list[CancellationTrendRow]
    cancellation_reasons: list[CancellationReasonRow]
    organizer_cancellations: list[OrganizerCancellationRow]
    top_room: RoomUsageRow | None = None
