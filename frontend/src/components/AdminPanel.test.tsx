import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { AdminPanel } from "./AdminPanel";

vi.mock("../services/api", () => ({
  api: {
    adminRooms: vi.fn(), adminEquipment: vi.fn(), createRoom: vi.fn(), updateRoom: vi.fn(), deactivateRoom: vi.fn(),
    createEquipment: vi.fn(), updateEquipment: vi.fn(), deactivateEquipment: vi.fn(),
  },
}));

describe("AdminPanel forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.adminRooms).mockResolvedValue([]);
    vi.mocked(api.adminEquipment).mockResolvedValue([]);
    vi.mocked(api.createRoom).mockResolvedValue({ id: 99, name: "E201", capacity: 12, location: "Khu E" });
    vi.mocked(api.createEquipment).mockResolvedValue({ id: 88, code: "TB-NEW-01", name: "Thiết bị mới", category: "demo", location: "Kho", status: "available", is_active: true });
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

  it("submits the equipment administration form", async () => {
    render(<AdminPanel adminEmail="leader@example.com" />);
    await screen.findByRole("button", { name: "Quản lý thiết bị" });
    fireEvent.click(screen.getByRole("button", { name: "Quản lý thiết bị" }));
    fireEvent.change(screen.getByLabelText("Mã thiết bị quản trị"), { target: { value: "TB-NEW-01" } });
    fireEvent.change(screen.getByLabelText("Tên thiết bị quản trị"), { target: { value: "Thiết bị mới" } });
    fireEvent.change(screen.getByLabelText("Loại"), { target: { value: "demo" } });
    fireEvent.change(screen.getByLabelText("Vị trí"), { target: { value: "Kho" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm thiết bị" }));
    await waitFor(() => expect(api.createEquipment).toHaveBeenCalledWith(expect.objectContaining({
      requester_email: "leader@example.com", code: "TB-NEW-01", name: "Thiết bị mới",
    })));
  });
});
