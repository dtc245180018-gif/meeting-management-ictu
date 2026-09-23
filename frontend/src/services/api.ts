import type { Booking, Meeting, MeetingInput, Room, SuggestedTime } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch {
    throw new Error("Không thể kết nối Backend tại cổng 8000. Hãy khởi động API rồi thử lại.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail ?? "Không thể kết nối tới máy chủ");
  }
  return response.json() as Promise<T>;
}

export const api = {
  listMeetings: () => request<Meeting[]>("/meetings"),

  createMeeting: (payload: MeetingInput) =>
    request<Meeting[]>("/meetings", { method: "POST", body: JSON.stringify(payload) }),

  updateMeeting: (id: number, payload: Partial<MeetingInput> & { requester_email: string }) =>
    request<Meeting>(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  cancelMeeting: (id: number, requesterEmail: string) =>
    request<Meeting>(`/meetings/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ requester_email: requesterEmail }),
    }),

  history: (email: string) =>
    request<Meeting[]>(`/meetings/history?email=${encodeURIComponent(email)}`),

  suggestTimes: (participantEmails: string[], rangeStart: string, rangeEnd: string, durationMinutes = 60) =>
    request<SuggestedTime[]>("/meetings/suggest-times", {
      method: "POST",
      body: JSON.stringify({
        participant_emails: participantEmails,
        range_start: rangeStart,
        range_end: rangeEnd,
        duration_minutes: durationMinutes,
        limit: 5,
      }),
    }),

  availableRooms: (startTime: string, endTime: string, minCapacity: number) => {
    const params = new URLSearchParams({
      start_time: startTime,
      end_time: endTime,
      min_capacity: String(minCapacity),
    });
    return request<Room[]>(`/rooms/available?${params.toString()}`);
  },

  bookRoom: (roomId: number, meetingId: number, requesterEmail: string) =>
    request<Booking>("/rooms/bookings", {
      method: "POST",
      body: JSON.stringify({ room_id: roomId, meeting_id: meetingId, requester_email: requesterEmail }),
    }),
};
