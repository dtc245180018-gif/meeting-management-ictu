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
  start_time: string;
  end_time: string;
  recurrence?: "weekly" | "monthly";
  recurrence_group?: string;
  status: MeetingStatus;
  participants: Participant[];
  booking?: Booking;
}

export interface MeetingInput {
  title: string;
  description: string;
  organizer_email: string;
  start_time: string;
  end_time: string;
  participant_emails: string[];
  recurrence: "weekly" | "monthly" | null;
  recurrence_count: number;
}

export interface SuggestedTime {
  start_time: string;
  end_time: string;
}
