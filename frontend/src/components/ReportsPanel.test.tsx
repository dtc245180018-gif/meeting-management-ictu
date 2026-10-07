import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsPanel } from "./ReportsPanel";
import { api, downloadAuthenticated } from "../services/api";


vi.mock("../services/api", () => ({
  downloadAuthenticated: vi.fn(),
  api: {
    listRooms: vi.fn(),
    reportOverview: vi.fn(),
    reportExportUrl: vi.fn(() => "/api/admin/reports/export?format=xlsx"),
  },
}));


describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRooms).mockResolvedValue([]);
    vi.mocked(api.reportOverview).mockResolvedValue({
      generated_at: "2026-10-07T00:00:00Z", timezone: "Asia/Ho_Chi_Minh",
      date_from: "2026-09-07T00:00:00Z", date_to: "2026-11-07T00:00:00Z",
      summary: { total_meetings: 12, scheduled_meetings: 5, completed_meetings: 5, cancelled_meetings: 2, cancellation_rate: 16.67, total_bookings: 9, total_booking_minutes: 540 },
      room_usage: [], cancellation_trend: [], cancellation_reasons: [], organizer_cancellations: [],
    });
  });

  it("renders real report totals and exports with the same filters", async () => {
    render(<ReportsPanel />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("16.67%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xuất Excel" }));
    await waitFor(() => expect(downloadAuthenticated).toHaveBeenCalled());
  });
});
