import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HrmSyncPanel } from "./HrmSyncPanel";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    hrmStatus: vi.fn(),
    hrmHistory: vi.fn(),
    runHrmSync: vi.fn(),
  },
}));

describe("HrmSyncPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.hrmStatus).mockResolvedValue({ connector: "mock", configured: true, running: false, periodic_enabled: false, detail: "Mock connector sẵn sàng." });
    vi.mocked(api.hrmHistory).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5, total_pages: 1 });
    vi.mocked(api.runHrmSync).mockResolvedValue({ id: 4, source: "mock", trigger: "manual", status: "completed", total_count: 4, created_count: 2, updated_count: 1, skipped_count: 1, failed_count: 0, started_at: "2026-10-14T08:00:00Z", finished_at: "2026-10-14T08:00:01Z", issues: [] });
  });

  it("shows connector state and runs a manual admin synchronization", async () => {
    render(<HrmSyncPanel />);
    expect(await screen.findByText("Sẵn sàng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đồng bộ từ connector" }));
    await waitFor(() => expect(api.runHrmSync).toHaveBeenCalledWith(undefined));
    expect(await screen.findByText(/Đồng bộ #4/)).toBeInTheDocument();
  });

  it("rejects malformed manual JSON before sending it", async () => {
    render(<HrmSyncPanel />);
    fireEvent.click(await screen.findByText("Nhập dữ liệu JSON thủ công để kiểm thử adapter"));
    fireEvent.change(screen.getByPlaceholderText(/external_id/), { target: { value: "{}" } });
    fireEvent.click(screen.getByRole("button", { name: "Đồng bộ JSON" }));
    expect(await screen.findByText("Dữ liệu phải là một mảng JSON gồm các nhân viên.")).toBeInTheDocument();
    expect(api.runHrmSync).not.toHaveBeenCalled();
  });
});
