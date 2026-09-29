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

describe("RoomDirectory filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRooms).mockResolvedValue(rooms);
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
});
