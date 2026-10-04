import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { NotificationCenter } from "./NotificationCenter";

vi.mock("../services/api", () => ({ api: { notifications: vi.fn(), emailStatus: vi.fn(), markNotificationRead: vi.fn() } }));

const notification = {
  id: 5, meeting_id: 9, recipient_email: "leader@example.com", channel: "email",
  kind: "reminder" as const,
  remind_at: "2026-10-01T01:30:00Z", status: "pending" as const, attempts: 0,
  is_read: false, created_at: "2026-09-29T01:00:00Z", meeting_title: "Họp Sprint 2",
};

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.notifications).mockResolvedValue([notification]);
    vi.mocked(api.emailStatus).mockResolvedValue({ backend: "console", configured: false, detail: "Chế độ console" });
    vi.mocked(api.markNotificationRead).mockResolvedValue({ ...notification, is_read: true });
  });

  it("loads notifications and marks one as read", async () => {
    render(<NotificationCenter email="leader@example.com" />);
    fireEvent.click(await screen.findByRole("button", { name: /Họp Sprint 2/ }));
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith(5, "leader@example.com"));
    expect(screen.getByText("0 chưa đọc")).toBeInTheDocument();
    expect(screen.getByText("Email đang ở chế độ mô phỏng")).toBeInTheDocument();
  });

  it("shows a join action for an employee when a meeting-start alert is due", async () => {
    const onOpenMeeting = vi.fn();
    vi.mocked(api.notifications).mockResolvedValue([{
      ...notification,
      id: 8,
      kind: "meeting_starting",
      subject: "Sắp đến giờ họp: Họp Sprint 2",
      meeting_start_time: "2026-10-01T02:00:00Z",
      room_name: "A2-301",
      status: "sent",
    }]);

    render(<NotificationCenter email="employee.one@example.com" onOpenMeeting={onOpenMeeting} />);
    fireEvent.click(await screen.findByRole("button", { name: "Vào họp" }));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith(8, "employee.one@example.com"));
    expect(onOpenMeeting).toHaveBeenCalledWith(9);
    expect(screen.getByText(/A2-301/)).toBeInTheDocument();
  });
});
