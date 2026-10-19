import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { GoogleCalendarPanel } from "./GoogleCalendarPanel";

vi.mock("../services/api", () => ({
  api: {
    googleStatus: vi.fn(),
    googleConnectUrl: vi.fn(),
    disconnectGoogle: vi.fn(),
  },
}));

describe("GoogleCalendarPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.googleStatus).mockResolvedValue({
      configured: true,
      connected: false,
      user_email: "",
      google_email: null,
      connected_at: null,
      missing_settings: [],
    });
  });

  it("allows an ICTU account to start the Google Calendar connection", async () => {
    render(<GoogleCalendarPanel email="teacher@ictu.edu.vn" />);

    expect(await screen.findByRole("button", { name: "Kết nối Google Calendar" })).toBeInTheDocument();
  });

  it("keeps system access but blocks Google Calendar for an external account", async () => {
    render(<GoogleCalendarPanel email="employee@gmail.com" />);

    expect(await screen.findByText("Chỉ tài khoản Google ICTU được phép kết nối.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kết nối Google Calendar" })).not.toBeInTheDocument();
  });
});
