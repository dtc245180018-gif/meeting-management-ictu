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
];

describe("RoomDirectory filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listRooms).mockResolvedValue(rooms);
  });

  it("filters the catalog by equipment", async () => {
    render(<RoomDirectory meetings={[]} />);
    await screen.findByText("A101");
    fireEvent.change(screen.getByLabelText("Thiết bị"), { target: { value: "video_conferencing" } });
    await waitFor(() => {
      expect(screen.queryByText("A101")).not.toBeInTheDocument();
      expect(screen.getByText("B301")).toBeInTheDocument();
    });
  });
});
