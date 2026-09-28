import type { Meeting, MeetingStatus, Room } from "../types";

export interface MeetingFilterOptions {
  email?: string;
  status?: "all" | MeetingStatus;
  from?: string;
  to?: string;
}

export function filterMeetings(meetings: Meeting[], options: MeetingFilterOptions): Meeting[] {
  const email = options.email?.trim().toLowerCase() ?? "";
  const from = options.from ? new Date(`${options.from}T00:00:00`) : null;
  const to = options.to ? new Date(`${options.to}T23:59:59`) : null;

  return meetings.filter((meeting) => {
    const date = new Date(meeting.start_time);
    const matchesEmail = !email
      || meeting.organizer_email === email
      || meeting.participants.some((person) => person.email === email);
    const matchesStatus = !options.status || options.status === "all" || meeting.status === options.status;
    return matchesEmail && matchesStatus && (!from || date >= from) && (!to || date <= to);
  });
}

export function getBookedRoomIds(meetings: Meeting[], startTime?: string, endTime?: string): Set<number> {
  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : null;
  return new Set(
    meetings
      .filter((meeting) => {
        if (meeting.booking?.status !== "active") return false;
        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
        return new Date(meeting.booking.start_time) < end && new Date(meeting.booking.end_time) > start;
      })
      .map((meeting) => meeting.booking?.room_id)
      .filter((roomId): roomId is number => roomId !== undefined),
  );
}

export function filterRooms(rooms: Room[], bookedRoomIds: Set<number>, status: "all" | "booked" | "free"): Room[] {
  if (status === "booked") return rooms.filter((room) => bookedRoomIds.has(room.id));
  if (status === "free") return rooms.filter((room) => !bookedRoomIds.has(room.id));
  return rooms;
}
