export type MeetingStatus = "scheduled" | "cancelled";

export interface Participant {
  id: number;
  email: string;
  status: "invited" | "accepted" | "declined";
}

export interface Room {
  id: number;
  name: string;
  capacity: number;
  location: string;
  building?: string;
  floor?: number;
  room_type?: string;
  projector?: boolean;
  display?: boolean;
  microphone?: boolean;
  video_conferencing?: boolean;
  is_active?: boolean;
  can_book?: boolean;
  restriction_reason?: string;
}

export type EquipmentStatus = "available" | "booked" | "maintenance" | "inactive";

export interface Equipment {
  id: number;
  code: string;
  name: string;
  category: string;
  location: string;
  status: EquipmentStatus;
  is_active: boolean;
}

export interface EquipmentBooking {
  id: number;
  equipment_id: number;
  meeting_id: number;
  start_time: string;
  end_time: string;
  status: "active" | "cancelled";
  equipment: Equipment;
}

export interface Employee {
  id: number;
  full_name: string;
  email: string;
  department: string;
  is_active: boolean;
}

export interface Booking {
  id: number;
  room_id: number;
  meeting_id: number;
  start_time: string;
  end_time: string;
  status: "active" | "cancelled";
  room: Room;
}

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  organizer_email: string;
  expected_attendees?: number;
  start_time: string;
  end_time: string;
  recurrence?: "weekly" | "monthly";
  recurrence_group?: string;
  status: MeetingStatus;
  cancellation_reason?: string;
  participants: Participant[];
  booking?: Booking;
  equipment_bookings?: EquipmentBooking[];
  google_calendar_event?: GoogleCalendarEvent;
}

export interface GoogleCalendarEvent {
  sync_status: "pending" | "synced" | "failed" | "deleted";
  html_link?: string;
  error_message?: string;
  synced_at?: string;
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  user_email: string;
  google_email?: string;
  connected_at?: string;
  missing_settings: string[];
}

export interface EmailIntegrationStatus {
  backend: "console" | "smtp";
  configured: boolean;
  sender?: string;
  detail: string;
}

export interface MeetingInput {
  title: string;
  description: string;
  organizer_email: string;
  start_time: string;
  end_time: string;
  participant_emails: string[];
  expected_attendees: number;
  room_id?: number | null;
  equipment_ids?: number[];
  reminder_minutes?: 15 | 30 | 60 | 1440 | null;
  recurrence: "weekly" | "monthly" | null;
  recurrence_count: number;
}

export interface SuggestedTime {
  start_time: string;
  end_time: string;
}

export interface CalendarLinks {
  google_url: string;
  outlook_ics_url: string;
}

export interface Notification {
  id: number;
  meeting_id: number;
  recipient_email: string;
  channel: string;
  kind: "reminder" | "meeting_starting" | "invitation" | "meeting_updated" | "meeting_cancelled" | "invitation_response";
  subject?: string;
  body?: string;
  remind_at: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  attempts: number;
  error_message?: string;
  is_read: boolean;
  created_at: string;
  sent_at?: string;
  meeting_title?: string;
  meeting_start_time?: string;
  meeting_end_time?: string;
  room_name?: string;
  can_join: boolean;
}

export interface RoomAdminInput {
  requester_email: string;
  name: string;
  capacity: number;
  location: string;
  building: string;
  floor: number;
  room_type: string;
  projector?: boolean;
  display?: boolean;
  microphone?: boolean;
  video_conferencing?: boolean;
  is_active?: boolean;
}

export interface EquipmentAdminInput {
  requester_email: string;
  code: string;
  name: string;
  category: string;
  location: string;
  status?: "available" | "maintenance" | "inactive";
  is_active?: boolean;
}

export type AccountRole = "admin" | "organizer" | "participant";

export interface Account {
  id: number;
  employee_id: number;
  email: string;
  full_name: string;
  department: string;
  role: AccountRole;
  must_change_password: boolean;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface AccountPage {
  items: Account[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RoomPermission {
  account_id: number;
  room_id: number;
  room_name: string;
  can_book: boolean;
  reason?: string;
}

export interface ReportOverview {
  generated_at: string;
  timezone: string;
  date_from: string;
  date_to: string;
  summary: {
    total_meetings: number;
    scheduled_meetings: number;
    completed_meetings: number;
    cancelled_meetings: number;
    cancellation_rate: number;
    total_bookings: number;
    total_booking_minutes: number;
  };
  room_usage: Array<{
    room_id: number;
    room_name: string;
    building: string;
    floor: number;
    booking_count: number;
    booked_minutes: number;
    scheduled_count: number;
    completed_count: number;
    cancelled_count: number;
  }>;
  cancellation_trend: Array<{
    date: string;
    total_count: number;
    cancelled_count: number;
    cancellation_rate: number;
  }>;
  cancellation_reasons: Array<{ reason: string; count: number }>;
  organizer_cancellations: Array<{
    organizer_email: string;
    total_count: number;
    cancelled_count: number;
    cancellation_rate: number;
  }>;
  top_room?: ReportOverview["room_usage"][number];
}
