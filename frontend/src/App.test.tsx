import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./services/api";

vi.mock("./services/api", () => ({
  api: {
    listMeetings: vi.fn(),
    listEmployees: vi.fn(),
    notifications: vi.fn(),
  },
}));

vi.mock("./components/MeetingForm", () => ({ MeetingForm: () => <div>Tạo lịch</div> }));
vi.mock("./components/MeetingList", () => ({ MeetingList: () => <div>Danh sách lịch</div> }));
vi.mock("./components/RoomDirectory", () => ({ RoomDirectory: () => <div>Danh sách phòng</div> }));
vi.mock("./components/EquipmentDirectory", () => ({ EquipmentDirectory: () => <div>Danh sách thiết bị</div> }));
vi.mock("./components/AdminPanel", () => ({ AdminPanel: () => <div>Quản trị</div> }));
vi.mock("./components/GoogleCalendarPanel", () => ({ GoogleCalendarPanel: () => <div>Google Calendar</div> }));
vi.mock("./components/NotificationCenter", () => ({ NotificationCenter: () => <div>Trung tâm thông báo</div> }));

describe("App navigation indicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.listMeetings).mockResolvedValue([{
      id: 21,
      title: "Lịch mới",
      organizer_email: "leader@example.com",
      start_time: "2099-10-06T02:00:00Z",
      end_time: "2099-10-06T03:00:00Z",
      status: "scheduled",
      participants: [],
    }]);
    vi.mocked(api.notifications).mockResolvedValue([{
      id: 31,
      meeting_id: 21,
      recipient_email: "leader@example.com",
      channel: "email",
      kind: "invitation",
      remind_at: "2099-10-05T02:00:00Z",
      status: "sent",
      attempts: 0,
      is_read: false,
      created_at: "2099-10-05T02:00:00Z",
      can_join: false,
    }]);
  });

  it("shows red dots for a new meeting and an unread notification", async () => {
    render(<App />);

    expect(await screen.findByLabelText("Có lịch họp mới")).toBeInTheDocument();
    expect(await screen.findByLabelText("Có thông báo mới")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Lịch họp/ }));
    await waitFor(() => expect(screen.queryByLabelText("Có lịch họp mới")).not.toBeInTheDocument());
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(window.localStorage.key(0) ?? "")).toBe("21");
  });
});
