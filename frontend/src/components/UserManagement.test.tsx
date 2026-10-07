import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserManagement } from "./UserManagement";
import { api } from "../services/api";


vi.mock("../services/api", () => ({
  api: {
    adminUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    roomPermissions: vi.fn(),
    updateRoomPermission: vi.fn(),
  },
}));


describe("UserManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.adminUsers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 8, total_pages: 1 });
    vi.mocked(api.createUser).mockResolvedValue({
      id: 2, employee_id: 2, email: "new@ictu.edu.vn", full_name: "Nhân viên mới",
      department: "Khoa CNTT", role: "participant", must_change_password: true,
      is_active: true, created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("creates an account with the selected role and explains the temporary password", async () => {
    render(<UserManagement />);
    fireEvent.change(screen.getByLabelText("Họ tên"), { target: { value: "Nhân viên mới" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@ictu.edu.vn" } });
    fireEvent.change(screen.getByLabelText("Đơn vị"), { target: { value: "Khoa CNTT" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({
      full_name: "Nhân viên mới", email: "new@ictu.edu.vn", department: "Khoa CNTT", role: "participant",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("ICTU123");
  });
});
