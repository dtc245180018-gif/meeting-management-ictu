import type {
  Booking,
  CalendarLinks,
  Employee,
  Equipment,
  EquipmentAdminInput,
  EquipmentStatus,
  Meeting,
  MeetingInput,
  Notification,
  Room,
  RoomAdminInput,
  SuggestedTime,
} from "../types";

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

  history: (email: string, options: { status?: string; dateFrom?: string; dateTo?: string; offset?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({ email });
    if (options.status && options.status !== "all") params.set("status", options.status);
    if (options.dateFrom) params.set("date_from", options.dateFrom);
    if (options.dateTo) params.set("date_to", options.dateTo);
    params.set("offset", String(options.offset ?? 0));
    params.set("limit", String(options.limit ?? 100));
    return request<Meeting[]>(`/meetings/history?${params.toString()}`);
  },

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

  listRooms: () => request<Room[]>("/rooms"),

  listEmployees: () => request<Employee[]>("/employees"),

  bookRoom: (roomId: number, meetingId: number, requesterEmail: string) =>
    request<Booking>("/rooms/bookings", {
      method: "POST",
      body: JSON.stringify({ room_id: roomId, meeting_id: meetingId, requester_email: requesterEmail }),
    }),

  listEquipment: (options: { startTime?: string; endTime?: string; category?: string; status?: EquipmentStatus } = {}) => {
    const params = new URLSearchParams();
    if (options.startTime) params.set("start_time", options.startTime);
    if (options.endTime) params.set("end_time", options.endTime);
    if (options.category) params.set("category", options.category);
    if (options.status) params.set("status", options.status);
    const query = params.toString();
    return request<Equipment[]>(`/equipment${query ? `?${query}` : ""}`);
  },

  availableEquipment: (startTime: string, endTime: string, category?: string) => {
    const params = new URLSearchParams({ start_time: startTime, end_time: endTime });
    if (category) params.set("category", category);
    return request<Equipment[]>(`/equipment/available?${params.toString()}`);
  },

  adminRooms: (requesterEmail: string) =>
    request<Room[]>(`/admin/rooms?${new URLSearchParams({ requester_email: requesterEmail })}`),
  createRoom: (payload: RoomAdminInput) =>
    request<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(payload) }),
  updateRoom: (id: number, payload: Partial<RoomAdminInput> & { requester_email: string }) =>
    request<Room>(`/admin/rooms/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateRoom: (id: number, requesterEmail: string) =>
    request<Room>(`/admin/rooms/${id}?${new URLSearchParams({ requester_email: requesterEmail })}`, { method: "DELETE" }),

  adminEquipment: (requesterEmail: string) =>
    request<Equipment[]>(`/admin/equipment?${new URLSearchParams({ requester_email: requesterEmail })}`),
  createEquipment: (payload: EquipmentAdminInput) =>
    request<Equipment>("/admin/equipment", { method: "POST", body: JSON.stringify(payload) }),
  updateEquipment: (id: number, payload: Partial<EquipmentAdminInput> & { requester_email: string }) =>
    request<Equipment>(`/admin/equipment/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateEquipment: (id: number, requesterEmail: string) =>
    request<Equipment>(`/admin/equipment/${id}?${new URLSearchParams({ requester_email: requesterEmail })}`, { method: "DELETE" }),

  calendarLinks: (meetingId: number) => request<CalendarLinks>(`/meetings/${meetingId}/calendar-links`),
  calendarFileUrl: (meetingId: number) => `${API_URL}/meetings/${meetingId}/calendar.ics`,

  notifications: (email: string) =>
    request<Notification[]>(`/notifications?${new URLSearchParams({ email })}`),
  markNotificationRead: (id: number, email: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: "POST", body: JSON.stringify({ email }) }),
};
