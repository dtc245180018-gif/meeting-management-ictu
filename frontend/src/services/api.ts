import type {
  Booking,
  CalendarLinks,
  Employee,
  EmailIntegrationStatus,
  Equipment,
  EquipmentAdminInput,
  EquipmentStatus,
  GoogleCalendarEvent,
  GoogleConnectionStatus,
  Meeting,
  MeetingInput,
  Notification,
  Room,
  RoomAdminInput,
  SuggestedTime,
  Account,
  AccountPage,
  AccountRole,
  ReportOverview,
  RoomPermission,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "ictu-meeting-token";

type ApiErrorPayload = {
  detail?: unknown;
  message?: unknown;
};

type ValidationErrorItem = {
  loc?: unknown;
  msg?: unknown;
};

function validationErrorMessage(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;

  const validationItem = item as ValidationErrorItem;
  const location = Array.isArray(validationItem.loc)
    ? validationItem.loc.map(String)
    : [];
  if (location.includes("email")) return "Email không đúng định dạng.";
  if (location.includes("password")) return "Mật khẩu không hợp lệ.";
  return typeof validationItem.msg === "string" ? validationItem.msg : null;
}

export function apiErrorMessage(payload: unknown, fallback = "Không thể kết nối tới máy chủ"): string {
  if (!payload || typeof payload !== "object") return fallback;

  const { detail, message } = payload as ApiErrorPayload;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = [...new Set(detail.map(validationErrorMessage).filter((item): item is string => Boolean(item)))];
    if (messages.length) return messages.join(" ");
  }
  if (detail && typeof detail === "object") {
    const normalized = validationErrorMessage(detail);
    if (normalized) return normalized;
  }
  if (typeof message === "string" && message.trim()) return message;
  return fallback;
}

export const authStorage = {
  get: () => window.localStorage.getItem(TOKEN_KEY),
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(authStorage.get() ? { Authorization: `Bearer ${authStorage.get()}` } : {}),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error("Không thể kết nối Backend tại cổng 8000. Hãy khởi động API rồi thử lại.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && path !== "/auth/login") {
      window.dispatchEvent(new Event("ictu-auth-expired"));
    }
    throw new Error(apiErrorMessage(payload));
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: "bearer"; user: Account }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Account>("/auth/me"),
  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  listMeetings: () => request<Meeting[]>("/meetings"),

  createMeeting: (payload: MeetingInput) =>
    request<Meeting[]>("/meetings", { method: "POST", body: JSON.stringify(payload) }),

  updateMeeting: (id: number, payload: Partial<MeetingInput> & { requester_email: string }) =>
    request<Meeting>(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  cancelMeeting: (id: number, requesterEmail: string, reason?: string) =>
    request<Meeting>(`/meetings/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ requester_email: requesterEmail, reason }),
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
  downloadCalendar: (meetingId: number) =>
    downloadAuthenticated(`${API_URL}/meetings/${meetingId}/calendar.ics`),

  respondToInvitation: (meetingId: number, email: string, status: "accepted" | "declined") =>
    request<Meeting>(`/meetings/${meetingId}/invitations/respond`, {
      method: "POST",
      body: JSON.stringify({ email, status }),
    }),

  googleStatus: (email: string) =>
    request<GoogleConnectionStatus>(`/integrations/google/status?${new URLSearchParams({ email })}`),
  emailStatus: () => request<EmailIntegrationStatus>("/integrations/email/status"),
  googleConnectUrl: (email: string) =>
    request<{ authorization_url: string }>(`/integrations/google/connect?${new URLSearchParams({ email })}`),
  disconnectGoogle: (email: string) =>
    request<{ message: string }>(`/integrations/google?${new URLSearchParams({ email })}`, { method: "DELETE" }),
  syncGoogleCalendar: (meetingId: number, requesterEmail: string) =>
    request<GoogleCalendarEvent>(`/meetings/${meetingId}/google-calendar/sync`, {
      method: "POST",
      body: JSON.stringify({ requester_email: requesterEmail }),
    }),

  notifications: (email: string) =>
    request<Notification[]>(`/notifications?${new URLSearchParams({ email })}`),
  markNotificationRead: (id: number, email: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: "POST", body: JSON.stringify({ email }) }),

  adminUsers: (options: { search?: string; role?: AccountRole | ""; active?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      page_size: String(options.pageSize ?? 10),
    });
    if (options.search) params.set("search", options.search);
    if (options.role) params.set("role", options.role);
    if (options.active) params.set("is_active", options.active);
    return request<AccountPage>(`/admin/users?${params.toString()}`);
  },
  createUser: (payload: { full_name: string; email: string; department: string; role: AccountRole }) =>
    request<Account>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id: number, payload: Partial<{ full_name: string; department: string; role: AccountRole; is_active: boolean; reset_password: boolean }>) =>
    request<Account>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  roomPermissions: (accountId: number) =>
    request<RoomPermission[]>(`/admin/users/${accountId}/room-permissions`),
  updateRoomPermission: (accountId: number, roomId: number, canBook: boolean, reason?: string) =>
    request<RoomPermission>(`/admin/users/${accountId}/room-permissions/${roomId}`, {
      method: "PUT",
      body: JSON.stringify({ can_book: canBook, reason }),
    }),
  reportOverview: (params: URLSearchParams) =>
    request<ReportOverview>(`/admin/reports/overview?${params.toString()}`),
  reportExportUrl: (format: "xlsx" | "pdf", params: URLSearchParams) => {
    const query = new URLSearchParams(params);
    query.set("format", format);
    return `${API_URL}/admin/reports/export?${query.toString()}`;
  },
};

export async function downloadAuthenticated(url: string): Promise<void> {
  const response = await fetch(url, {
    headers: authStorage.get() ? { Authorization: `Bearer ${authStorage.get()}` } : {},
  });
  if (!response.ok) {
    throw new Error(apiErrorMessage(await response.json().catch(() => null), "Không thể xuất báo cáo"));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "ictu-meeting-report";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
