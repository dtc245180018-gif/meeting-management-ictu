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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.calendarLinks).mockResolvedValue({ google_url: "https://calendar.google.com/demo", outlook_ics_url: "/api/meetings/7/calendar.ics" });
    vi.mocked(api.calendarFileUrl).mockReturnValue("/api/meetings/7/calendar.ics");
    vi.stubGlobal("open", vi.fn());
  });

  it("offers Google Calendar and Outlook ICS and shows booked equipment", async () => {
    render(<MeetingList meetings={[meeting]} onChanged={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Tải lịch Outlook/ICS" })).toHaveAttribute("href", "/api/meetings/7/calendar.ics");
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào Google Calendar" }));
    await waitFor(() => expect(api.calendarLinks).toHaveBeenCalledWith(7));
    expect(window.open).toHaveBeenCalledWith("https://calendar.google.com/demo", "_blank", "noopener,noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    expect(screen.getByText("TB-MC-01 · Máy chiếu")).toBeInTheDocument();
  });
});
