import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { MeetingList } from "./MeetingList";

vi.mock("../services/api", () => ({
  api: {
    listEmployees: vi.fn(), calendarLinks: vi.fn(), calendarFileUrl: vi.fn(),
    updateMeeting: vi.fn(), cancelMeeting: vi.fn(), availableRooms: vi.fn(), bookRoom: vi.fn(),
  },
}));

const meeting = {
  id: 7, title: "Họp tích hợp lịch", description: "Demo", organizer_email: "leader@ictu.edu.vn",
  expected_attendees: 1, start_time: "2026-10-01T02:00:00Z", end_time: "2026-10-01T03:00:00Z",
  status: "scheduled" as const, participants: [], equipment_bookings: [{
    id: 3, equipment_id: 2, meeting_id: 7, start_time: "2026-10-01T02:00:00Z", end_time: "2026-10-01T03:00:00Z",
    status: "active" as const,
    equipment: { id: 2, code: "TB-MC-01", name: "Máy chiếu", category: "projector", location: "Kho", status: "available" as const, is_active: true },
  }],
};

describe("MeetingList calendar integration", () => {
  const popup = {
    opener: {} as Window | null,
    location: { replace: vi.fn() },
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.calendarLinks).mockResolvedValue({ google_url: "https://calendar.google.com/demo", outlook_ics_url: "/api/meetings/7/calendar.ics" });
    vi.mocked(api.calendarFileUrl).mockReturnValue("/api/meetings/7/calendar.ics");
    popup.location.replace.mockReset();
    popup.close.mockReset();
    vi.stubGlobal("open", vi.fn(() => popup as unknown as Window));
  });

  it("offers Google Calendar and Outlook ICS and shows booked equipment", async () => {
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@ictu.edu.vn" />);
    expect(screen.getByRole("link", { name: "Tải lịch Outlook/ICS" })).toHaveAttribute("href", "/api/meetings/7/calendar.ics");
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào Google Calendar" }));
    await waitFor(() => expect(api.calendarLinks).toHaveBeenCalledWith(7));
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.location.replace).toHaveBeenCalledWith("https://calendar.google.com/demo");
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    expect(screen.getByText("TB-MC-01 · Máy chiếu")).toBeInTheDocument();
  });

  it("does not let another demo user manage the organizer's meeting", () => {
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="minhanh@ictu.edu.vn" />);
    expect(screen.queryByRole("button", { name: `Thao tác cho ${meeting.title}` })).not.toBeInTheDocument();
    expect(screen.queryByText("Mở ⋯ để thao tác")).not.toBeInTheDocument();
  });

  it("uses the active demo user when the organizer cancels", async () => {
    vi.mocked(api.cancelMeeting).mockResolvedValue({ ...meeting, status: "cancelled" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@ictu.edu.vn" />);
    fireEvent.click(screen.getByRole("button", { name: `Thao tác cho ${meeting.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Hủy lịch" }));
    await waitFor(() => expect(api.cancelMeeting).toHaveBeenCalledWith(7, "leader@ictu.edu.vn"));
  });

  it("does not offer a normal Google Calendar action for a cancelled meeting", () => {
    render(<MeetingList meetings={[{ ...meeting, status: "cancelled" }]} onChanged={vi.fn()} currentUserEmail="leader@ictu.edu.vn" />);
    expect(screen.queryByRole("button", { name: "Thêm vào Google Calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tải lịch Outlook/ICS" })).toBeInTheDocument();
  });

  it("closes the pre-opened tab when the calendar API fails", async () => {
    vi.mocked(api.calendarLinks).mockRejectedValue(new Error("Không lấy được liên kết lịch"));
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} currentUserEmail="leader@ictu.edu.vn" />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào Google Calendar" }));
    await screen.findByText("Không lấy được liên kết lịch");
    expect(popup.close).toHaveBeenCalledOnce();
  });
});
