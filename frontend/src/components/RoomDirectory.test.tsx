import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomDirectory } from "./RoomDirectory";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    listRooms: vi.fn(),
    availableRooms: vi.fn(),
  },
}));

const rooms = [
  { id: 1, name: "A101", capacity: 6, location: "Khu A", building: "Khu A", floor: 1, room_type: "Phòng họp", projector: true, display: false, microphone: false, video_conferencing: false },
  { id: 2, name: "B301", capacity: 20, location: "Khu B", building: "Khu B", floor: 3, room_type: "Phòng họp lớn", projector: false, display: true, microphone: true, video_conferencing: true },
  { id: 3, name: "D202", capacity: 12, location: "Khu D", building: "Khu D", floor: 2, room_type: "Phòng họp", projector: true, display: true, microphone: true, video_conferencing: false },
];

const meetingsWithBooking = [{
  id: 10,
  title: "Lịch đã đặt phòng",
  organizer_email: "leader@ictu.edu.vn",
  expected_attendees: 2,
  start_time: "2026-10-01T02:00:00Z",
  end_time: "2026-10-01T03:00:00Z",
  status: "scheduled" as const,
  participants: [],
  booking: {
    id: 4,
    room_id: 1,
    meeting_id: 10,
    start_time: "2026-10-01T02:00:00Z",
    end_time: "2026-10-01T03:00:00Z",
    status: "active" as const,
    room: rooms[0],
  },
}];

describe("RoomDirectory filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRooms).mockResolvedValue(rooms);
    vi.mocked(api.availableRooms).mockResolvedValue([rooms[1]]);
  });

  it("filters the catalog by equipment", async () => {
    render(<RoomDirectory meetings={[]} />);
    expect(screen.queryByText("A101")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Xem danh sách phòng" }));
    await screen.findByText("A101");
    fireEvent.change(screen.getByLabelText("Thiết bị"), { target: { value: "video_conferencing" } });
    await waitFor(() => {
      expect(screen.queryByText("A101")).not.toBeInTheDocument();
      expect(screen.getByText("B301")).toBeInTheDocument();
    });
  });

  it("shows building and floor choices only after loading the catalog", async () => {
    render(<RoomDirectory meetings={[]} />);
    await screen.findByRole("button", { name: "Xem danh sách phòng" });
    expect(screen.getByLabelText("Tòa nhà/khu vực")).toHaveTextContent("Khu D");
    expect(screen.getByLabelText("Tầng")).toHaveTextContent("2");
    expect(screen.getByLabelText("Tầng")).toHaveTextContent("3");
  });

  it("can clear all room filters and hide the catalog again", async () => {
    render(<RoomDirectory meetings={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem danh sách phòng" }));
    await screen.findByText("A101");
    fireEvent.change(screen.getByLabelText("Tầng"), { target: { value: "2" } });
    expect(screen.queryByText("A101")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(screen.queryByText("A101")).not.toBeInTheDocument();
    expect(screen.getByText(/Danh sách phòng đang được ẩn/)).toBeInTheDocument();
  });

  it("filters booked and free rooms without requiring a time window", async () => {
    render(<RoomDirectory meetings={meetingsWithBooking} />);
    fireEvent.change(await screen.findByLabelText("Danh sách phòng"), { target: { value: "booked" } });
    expect(await screen.findByText("A101")).toBeInTheDocument();
    expect(screen.queryByText("B301")).not.toBeInTheDocument();
    expect(screen.getByText("Đã đặt theo lịch hiện có")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Danh sách phòng"), { target: { value: "free" } });
    expect(screen.queryByText("A101")).not.toBeInTheDocument();
    expect(screen.getByText("B301")).toBeInTheDocument();
  });

  it("filters rooms by minimum capacity through the availability API", async () => {
    render(<RoomDirectory meetings={[]} />);
    fireEvent.change(screen.getByLabelText("Từ lúc"), { target: { value: "2026-10-01T09:00" } });
    fireEvent.change(screen.getByLabelText("Đến lúc"), { target: { value: "2026-10-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Sức chứa tối thiểu"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem phòng đang trống" }));
    await waitFor(() => expect(api.availableRooms).toHaveBeenCalledWith(expect.any(String), expect.any(String), 20));
    expect(await screen.findByText(/Có 1 phòng phù hợp/)).toBeInTheDocument();
    expect(screen.getAllByText("B301").length).toBeGreaterThan(0);
  });
});
