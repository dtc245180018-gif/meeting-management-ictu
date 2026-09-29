import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { EquipmentDirectory } from "./EquipmentDirectory";

vi.mock("../services/api", () => ({ api: { listEquipment: vi.fn() } }));

const items = [
  { id: 1, code: "TB-MC-01", name: "Máy chiếu", category: "projector", location: "Kho", status: "available" as const, is_active: true },
  { id: 2, code: "TB-VC-01", name: "Bộ họp trực tuyến", category: "video_conference", location: "Kho", status: "maintenance" as const, is_active: true },
];

describe("EquipmentDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEquipment).mockResolvedValue(items);
  });

  it("shows equipment that is unavailable and its backend status", async () => {
    render(<EquipmentDirectory />);
    expect(await screen.findByText("Bộ họp trực tuyến")).toBeInTheDocument();
    expect(screen.getByText("Đang bảo trì", { selector: ".equipment-status" })).toBeInTheDocument();
  });

  it("sends category, status and time filters to the backend", async () => {
    render(<EquipmentDirectory />);
    await screen.findByText("Máy chiếu");
    fireEvent.change(screen.getByLabelText("Loại thiết bị"), { target: { value: "projector" } });
    fireEvent.change(screen.getByLabelText("Trạng thái thiết bị"), { target: { value: "available" } });
    fireEvent.change(screen.getByLabelText("Thiết bị từ lúc"), { target: { value: "2026-10-01T09:00" } });
    fireEvent.change(screen.getByLabelText("Thiết bị đến lúc"), { target: { value: "2026-10-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm thiết bị" }));
    await waitFor(() => expect(api.listEquipment).toHaveBeenLastCalledWith(expect.objectContaining({
      category: "projector", status: "available", startTime: expect.any(String), endTime: expect.any(String),
    })));
  });

  it("renders an API error state", async () => {
    vi.mocked(api.listEquipment).mockRejectedValue(new Error("Backend không khả dụng"));
    render(<EquipmentDirectory />);
    expect(await screen.findByText("Backend không khả dụng")).toBeInTheDocument();
  });
});
