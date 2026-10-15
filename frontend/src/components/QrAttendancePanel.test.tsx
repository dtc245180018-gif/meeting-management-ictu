import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QrAttendancePanel } from "./QrAttendancePanel";
import { api } from "../services/api";

const scannerMocks = vi.hoisted(() => ({
  instances: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn>; isScanning: boolean }>,
  cameras: [] as Array<{ id: string; label: string }>,
  start: vi.fn(),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    static getCameras = vi.fn().mockImplementation(async () => scannerMocks.cameras);
    isScanning = true;
    start = scannerMocks.start;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
    constructor() {
      scannerMocks.instances.push(this);
    }
  },
}));

vi.mock("../services/api", () => ({
  api: {
    bookingQr: vi.fn(),
    inspectBookingQr: vi.fn(),
    checkInBooking: vi.fn(),
    checkOutBooking: vi.fn(),
  },
}));

const account = {
  id: 1, employee_id: 1, email: "owner@ictu.edu.vn", full_name: "Owner", department: "ICTU",
  role: "organizer" as const, must_change_password: false, is_active: true, created_at: "2026-10-14T00:00:00Z",
};

const meeting = {
  id: 9,
  title: "Sprint 4 QR",
  organizer_email: account.email,
  start_time: "2026-10-14T09:00:00Z",
  end_time: "2026-10-14T10:00:00Z",
  status: "scheduled" as const,
  participants: [],
  booking: {
    id: 3, room_id: 2, meeting_id: 9, start_time: "2026-10-14T09:00:00Z", end_time: "2026-10-14T10:00:00Z", status: "active" as const,
    room: { id: 2, name: "A203", capacity: 12, location: "Khu A" },
  },
};

describe("QrAttendancePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerMocks.instances.length = 0;
    scannerMocks.cameras = [];
    scannerMocks.start.mockReset();
    scannerMocks.start.mockResolvedValue(null);
    vi.mocked(api.bookingQr).mockResolvedValue({ booking_id: 3, room_id: 2, expires_at: "2026-10-14T11:00:00Z", qr_token: "signed-token", image_data_url: "data:image/svg+xml;base64,AAA" });
    vi.mocked(api.inspectBookingQr).mockResolvedValue({ booking_id: 3, meeting_id: 9, meeting_title: "Sprint 4 QR", room_id: 2, room_name: "A203", start_time: meeting.start_time, end_time: meeting.end_time, meeting_status: "scheduled", can_check_in: true, can_check_out: false });
    vi.mocked(api.checkInBooking).mockResolvedValue({ booking_id: 3, account_id: 1, checked_in_at: "2026-10-14T09:01:00Z", already_recorded: false, message: "Check-in thành công." });
  });

  it("generates a signed QR for a meeting managed by the current user", async () => {
    render(<QrAttendancePanel account={account} meetings={[meeting]} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo QR" }));
    expect(await screen.findByAltText("QR cho lượt đặt phòng 3")).toBeInTheDocument();
    expect(api.bookingQr).toHaveBeenCalledWith(3);
  });

  it("supports the manual fallback and records check-in once", async () => {
    render(<QrAttendancePanel account={account} meetings={[meeting]} />);
    fireEvent.change(screen.getByLabelText("Mã dự phòng"), { target: { value: "signed-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra mã" }));
    expect(await screen.findByText("Sprint 4 QR")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check-in" }));
    await waitFor(() => expect(api.checkInBooking).toHaveBeenCalledWith("signed-token"));
    expect(await screen.findByText("Check-in thành công.")).toBeInTheDocument();
  });

  it("starts only after the scan button and prefers the rear-facing constraint", async () => {
    render(<QrAttendancePanel account={account} meetings={[]} />);
    expect(scannerMocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quét mã QR" }));
    await waitFor(() => expect(scannerMocks.start).toHaveBeenCalledWith(
      { facingMode: { exact: "environment" } },
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    ));
  });

  it("falls back to the rear camera id and stops after decoding", async () => {
    scannerMocks.start
      .mockRejectedValueOnce(new Error("environment unavailable"))
      .mockResolvedValueOnce(null);
    scannerMocks.cameras = [{ id: "front", label: "Front Camera" }, { id: "rear", label: "Back Camera" }];
    render(<QrAttendancePanel account={account} meetings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Quét mã QR" }));
    await waitFor(() => expect(scannerMocks.start).toHaveBeenNthCalledWith(
      2,
      "rear",
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    ));
    expect(scannerMocks.instances[0].stop).toHaveBeenCalled();
    expect(scannerMocks.instances[0].clear).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dừng camera" })).toBeInTheDocument();
    const successCallback = scannerMocks.start.mock.calls[1][2] as (value: string) => void;
    successCallback("signed-token");
    await waitFor(() => expect(scannerMocks.instances[1].stop).toHaveBeenCalled());
  });

  it("falls back to the last mobile camera with a clear notice when no rear label exists", async () => {
    scannerMocks.start
      .mockRejectedValueOnce(new Error("environment unavailable"))
      .mockResolvedValueOnce(null);
    scannerMocks.cameras = [{ id: "front", label: "FaceTime Camera" }, { id: "other", label: "Camera 2" }];
    render(<QrAttendancePanel account={account} meetings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Quét mã QR" }));
    expect(await screen.findByText(/Không đọc được nhãn camera sau/)).toBeInTheDocument();
    expect(scannerMocks.start).toHaveBeenNthCalledWith(2, "other", expect.anything(), expect.any(Function), expect.any(Function));
  });

  it("stops the scanner when the panel unmounts", async () => {
    const view = render(<QrAttendancePanel account={account} meetings={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Quét mã QR" }));
    await waitFor(() => expect(scannerMocks.instances).toHaveLength(1));
    view.unmount();
    await waitFor(() => expect(scannerMocks.instances[0].stop).toHaveBeenCalled());
  });
});
