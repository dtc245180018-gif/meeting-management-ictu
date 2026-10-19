import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { AdminPanel } from "./AdminPanel";

vi.mock("../services/api", () => ({
  api: {
    adminRooms: vi.fn(), adminEquipment: vi.fn(), createRoom: vi.fn(), updateRoom: vi.fn(), deactivateRoom: vi.fn(),
    createEquipment: vi.fn(), createEquipmentBulk: vi.fn(), updateEquipment: vi.fn(), deactivateEquipment: vi.fn(),
  },
}));

describe("AdminPanel forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.adminRooms).mockResolvedValue([]);
    vi.mocked(api.adminEquipment).mockResolvedValue([]);
    vi.mocked(api.createRoom).mockResolvedValue({ id: 99, name: "E201", capacity: 12, location: "Khu E" });
    vi.mocked(api.createEquipmentBulk).mockResolvedValue({ created_count: 10, items: [] });
  });

  it("submits the room administration form", async () => {
    render(<AdminPanel adminEmail="leader@example.com" />);
    await screen.findByRole("heading", { name: "Thêm phòng" });
    fireEvent.change(screen.getByLabelText("Tên phòng quản trị"), { target: { value: "E201" } });
    fireEvent.change(screen.getByLabelText("Sức chứa quản trị"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Vị trí"), { target: { value: "Tầng 2 - Khu E" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm phòng" }));
    await waitFor(() => expect(api.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      requester_email: "leader@example.com", name: "E201", capacity: 12,
    })));
  });

  it("creates a batch of individually coded equipment", async () => {
    render(<AdminPanel adminEmail="leader@example.com" />);
    await screen.findByRole("button", { name: "Quản lý thiết bị" });
    fireEvent.click(screen.getByRole("button", { name: "Quản lý thiết bị" }));
    fireEvent.change(screen.getByLabelText("Tiền tố mã thiết bị"), { target: { value: "TB-TV" } });
    fireEvent.change(screen.getByLabelText("Số lượng thiết bị"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Tên thiết bị quản trị"), { target: { value: "TV" } });
    fireEvent.click(screen.getByRole("button", { name: "Nhập kho" }));
    await waitFor(() => expect(api.createEquipmentBulk).toHaveBeenCalledWith(expect.objectContaining({
      requester_email: "leader@example.com", code_prefix: "TB-TV", quantity: 10, name: "TV", category: "display",
    })));
    expect(await screen.findByText(/Đã thêm 10 thiết bị/)).toBeInTheDocument();
  });
});
