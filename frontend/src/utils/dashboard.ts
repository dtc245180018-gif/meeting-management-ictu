import type { Meeting } from "../types";

export function scopeDashboardMeetings(meetings: Meeting[], email: string, isAdmin: boolean): Meeting[] {
  if (isAdmin) return meetings;
  const normalized = email.trim().toLowerCase();
  return meetings.filter((meeting) => meeting.organizer_email === normalized
    || meeting.participants.some((participant) => participant.email === normalized));
}

export function countPendingInvitations(meetings: Meeting[], email: string, isAdmin: boolean): number {
  const normalized = email.trim().toLowerCase();
  return meetings.reduce(
    (count, meeting) => count + meeting.participants.filter((participant) => participant.status === "invited"
      && (isAdmin || participant.email === normalized)).length,
    0,
  );
}
