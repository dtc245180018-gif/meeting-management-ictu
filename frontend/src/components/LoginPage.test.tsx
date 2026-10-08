import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { api } from "../services/api";


vi.mock("../services/api", () => ({
  authStorage: { set: vi.fn(), clear: vi.fn() },
  api: { login: vi.fn(), changePassword: vi.fn() },
}));


const account = {
  id: 1,
  employee_id: 1,
  email: "user@ictu.edu.vn",
  full_name: "Nguyễn Văn A",
  department: "Khoa CNTT",
  role: "organizer" as const,
  must_change_password: false,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};


describe("LoginPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs in and returns the authenticated account", async () => {
    vi.mocked(api.login).mockResolvedValue({ access_token: "signed-token", token_type: "bearer", user: account });
    const authenticated = vi.fn();
    render(<LoginPage onAuthenticated={authenticated} onPasswordChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email ICTU"), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "ICTU123" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith(account.email, "ICTU123"));
    expect(authenticated).toHaveBeenCalledWith(account);
  });

  it("requires matching new passwords on first login", () => {
    render(<LoginPage account={{ ...account, must_change_password: true }} onAuthenticated={vi.fn()} onPasswordChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Mật khẩu tạm thời"), { target: { value: "ICTU123" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu mới"), { target: { value: "KhacPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("chưa khớp");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("shows and hides the login password", () => {
    render(<LoginPage onAuthenticated={vi.fn()} onPasswordChanged={vi.fn()} />);
    const passwordInput = screen.getByLabelText("Mật khẩu");

    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ẩn mật khẩu" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows the new ICTU login identity and only the requested author", () => {
    render(<LoginPage onAuthenticated={vi.fn()} onPasswordChanged={vi.fn()} />);

    expect(screen.getByText("HỆ THỐNG QUẢN LÝ LỊCH HỌP")).toBeInTheDocument();
    expect(screen.getByText("Dev Nguyễn Ngọc Thắng · KTPM K23A")).toBeInTheDocument();
    expect(screen.queryByText(/Mai Văn Đạt/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quên mật khẩu?" }));
    expect(screen.getByRole("status")).toHaveTextContent("liên hệ quản trị viên");
  });

  it("shows inline validation matching the login design", () => {
    render(<LoginPage onAuthenticated={vi.fn()} onPasswordChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(screen.getByText("Vui lòng nhập tên đăng nhập.")).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });
});
