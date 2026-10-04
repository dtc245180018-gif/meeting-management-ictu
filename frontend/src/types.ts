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
  kind: "reminder" | "invitation" | "meeting_updated" | "meeting_cancelled" | "invitation_response";
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
