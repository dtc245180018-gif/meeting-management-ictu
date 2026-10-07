import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { MeetingList } from "./MeetingList";

vi.mock("../services/api", () => ({
  api: {
    listEmployees: vi.fn(), calendarLinks: vi.fn(), calendarFileUrl: vi.fn(), downloadCalendar: vi.fn(),
    updateMeeting: vi.fn(), cancelMeeting: vi.fn(), availableRooms: vi.fn(), bookRoom: vi.fn(),
    syncGoogleCalendar: vi.fn(), respondToInvitation: vi.fn(),
  },
}));

const meeting = {
  id: 7, title: "Họp tích hợp lịch", description: "Demo", organizer_email: "leader@example.com",
  expected_attendees: 1, start_time: "2026-10-01T02:00:00Z", end_time: "2026-10-01T03:00:00Z",
  status: "scheduled" as const, participants: [], equipment_bookings: [{
    id: 3, equipment_id: 2, meeting_id: 7, start_time: "2026-10-01T02:00:00Z", end_time: "2026-10-01T03:00:00Z",
    status: "active" as const,
    equipment: { id: 2, code: "TB-MC-01", name: "Máy chiếu", category: "projector", location: "Kho", status: "available" as const, is_active: true },
  }],
};

describe("MeetingList calendar integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.calendarLinks).mockResolvedValue({ google_url: "https://calendar.google.com/demo", outlook_ics_url: "/api/meetings/7/calendar.ics" });
    vi.mocked(api.calendarFileUrl).mockReturnValue("/api/meetings/7/calendar.ics");
    vi.mocked(api.syncGoogleCalendar).mockResolvedValue({ sync_status: "synced", html_link: "https://calendar.google.com/event/7" });
  });

  it("offers Google Calendar and Outlook ICS and shows booked equipment", async () => {
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Tải lịch Outlook/ICS" }));
    expect(api.downloadCalendar).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("button", { name: "Đồng bộ Google Calendar" }));
    await waitFor(() => expect(api.syncGoogleCalendar).toHaveBeenCalledWith(7, "leader@example.com"));
    expect(await screen.findByText(/Đã đồng bộ cuộc họp #7/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    expect(screen.getByText("TB-MC-01 · Máy chiếu")).toBeInTheDocument();
  });

  it("does not let another demo user manage the organizer's meeting", () => {
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="employee.one@example.com" />);
    expect(screen.queryByRole("button", { name: `Thao tác cho ${meeting.title}` })).not.toBeInTheDocument();
    expect(screen.queryByText("Mở ⋯ để thao tác")).not.toBeInTheDocument();
  });

  it("uses the active demo user when the organizer cancels", async () => {
    vi.mocked(api.cancelMeeting).mockResolvedValue({ ...meeting, status: "cancelled" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("");
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: `Thao tác cho ${meeting.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Hủy lịch" }));
    await waitFor(() => expect(api.cancelMeeting).toHaveBeenCalledWith(7, "leader@example.com"));
  });

  it("offers a Google cancellation sync for a cancelled meeting", () => {
    render(<MeetingList meetings={[{ ...meeting, status: "cancelled" }]} onChanged={vi.fn()} currentUserEmail="leader@example.com" />);
    expect(screen.getByRole("button", { name: "Đồng bộ trạng thái hủy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải lịch Outlook/ICS" })).toBeInTheDocument();
  });

  it("shows a clear error when Google Calendar sync fails", async () => {
    vi.mocked(api.syncGoogleCalendar).mockRejectedValue(new Error("Tài khoản chưa kết nối Google Calendar"));
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Đồng bộ Google Calendar" }));
    await screen.findByText("Tài khoản chưa kết nối Google Calendar");
  });

  it("opens meeting details from a dashboard join notification", () => {
    const onFocusHandled = vi.fn();
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="employee.one@example.com" focusMeetingId={7} onFocusHandled={onFocusHandled} />);
    expect(screen.getByRole("dialog", { name: "Họp tích hợp lịch" })).toBeInTheDocument();
    expect(onFocusHandled).toHaveBeenCalled();
  });

  it("replaces decline with a busy contact flow after accepting", () => {
    const acceptedMeeting = {
      ...meeting,
      participants: [{ id: 11, email: "employee.one@example.com", status: "accepted" as const }],
    };
    render(<MeetingList meetings={[acceptedMeeting]} onChanged={vi.fn()} currentUserEmail="employee.one@example.com" />);

    expect(screen.getByRole("button", { name: "Đã chấp nhận" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Từ chối" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Báo bận" }));

    const dialog = screen.getByRole("dialog", { name: "Liên hệ chủ cuộc họp" });
    expect(within(dialog).getByText("leader@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText(/phải liên hệ trực tiếp với chủ cuộc họp qua email công ty/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Soạn email cho chủ cuộc họp" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:leader@example\.com\?subject=/),
    );
    expect(api.respondToInvitation).not.toHaveBeenCalled();
  });

  it("keeps accept and decline actions while an invitation is pending", async () => {
    const invitedMeeting = {
      ...meeting,
      participants: [{ id: 12, email: "employee.one@example.com", status: "invited" as const }],
    };
    vi.mocked(api.respondToInvitation).mockResolvedValue({ ...invitedMeeting, participants: [] });
    render(<MeetingList meetings={[invitedMeeting]} onChanged={vi.fn()} currentUserEmail="employee.one@example.com" />);

    expect(screen.getByRole("button", { name: "Từ chối" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chấp nhận" }));
    await waitFor(() => expect(api.respondToInvitation).toHaveBeenCalledWith(7, "employee.one@example.com", "accepted"));
  });
});
