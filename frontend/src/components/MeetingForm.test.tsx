import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingForm } from "./MeetingForm";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    listEmployees: vi.fn(),
    availableRooms: vi.fn(),
    createMeeting: vi.fn(),
    suggestTimes: vi.fn(),
  },
}));

const room = {
  id: 7,
  name: "Phòng A101",
  capacity: 6,
  location: "Tầng 1 - Khu A",
  building: "Khu A",
  floor: 1,
  room_type: "Phòng họp nhỏ",
  projector: false,
  display: true,
  microphone: true,
  video_conferencing: false,
};

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Tên cuộc họp"), { target: { value: "Họp kiểm thử" } });
  fireEvent.change(screen.getByLabelText("Người tổ chức"), { target: { value: "leader@ictu.edu.vn" } });
  fireEvent.change(screen.getByLabelText("Bắt đầu"), { target: { value: "2026-10-01T09:00" } });
  fireEvent.change(screen.getByLabelText("Kết thúc"), { target: { value: "2026-10-01T10:00" } });
}

describe("MeetingForm room-aware creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.availableRooms).mockResolvedValue([room]);
    vi.mocked(api.createMeeting).mockResolvedValue([{
      id: 42,
      title: "Họp kiểm thử",
      organizer_email: "leader@ictu.edu.vn",
      expected_attendees: 3,
      start_time: "2026-10-01T02:00:00Z",
      end_time: "2026-10-01T03:00:00Z",
      status: "scheduled",
      participants: [],
    }]);
  });

  it("keeps a pending email on submit and sends the selected room in one request", async () => {
    render(<MeetingForm onCreated={vi.fn()} />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Người tham dự"), { target: { value: "one@ictu.edu.vn;two@ictu.edu.vn" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng phù hợp" }));
    await screen.findByText(/Đã tìm thấy 1 phòng phù hợp/);
    fireEvent.click(screen.getByRole("button", { name: /Phòng A101/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo lịch họp" }));

    await waitFor(() => expect(api.createMeeting).toHaveBeenCalledWith(expect.objectContaining({
      room_id: 7,
      expected_attendees: 3,
      participant_emails: ["one@ictu.edu.vn", "two@ictu.edu.vn"],
    })));
    expect(api.availableRooms).toHaveBeenCalledWith(expect.any(String), expect.any(String), 3);
  });

  it("adds an attendee from the email suggestion list", async () => {
    vi.mocked(api.listEmployees).mockResolvedValue([{
      id: 1,
      full_name: "Trần Minh Anh",
      email: "minhanh@ictu.edu.vn",
      department: "Khoa Công nghệ thông tin",
      is_active: true,
    }]);
    render(<MeetingForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Người tham dự"), { target: { value: "minhanh" } });
    const suggestion = await screen.findByRole("button", { name: /Trần Minh Anh/ });
    fireEvent.click(suggestion);
    expect(screen.getByText("minhanh@ictu.edu.vn")).toBeInTheDocument();
  });

  it("offers ICTU employees as meeting organizers", async () => {
    vi.mocked(api.listEmployees).mockResolvedValue([{
      id: 2,
      full_name: "Trần Minh Anh",
      email: "minhanh@ictu.edu.vn",
      department: "Khoa Công nghệ thông tin",
      is_active: true,
    }]);
    render(<MeetingForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Người tổ chức"), { target: { value: "minhanh" } });
    const suggestion = await screen.findByRole("button", { name: /Trần Minh Anh/ });
    fireEvent.click(suggestion);
    expect(screen.getByLabelText("Người tổ chức")).toHaveValue("minhanh@ictu.edu.vn");
  });

  it("invites all ICTU employees except the organizer", async () => {
    vi.mocked(api.listEmployees).mockResolvedValue([
      { id: 1, full_name: "Người tổ chức", email: "leader@ictu.edu.vn", department: "Nhóm dự án ICTU", is_active: true },
      { id: 2, full_name: "Trần Minh Anh", email: "minhanh@ictu.edu.vn", department: "Khoa Công nghệ thông tin", is_active: true },
      { id: 3, full_name: "Lê Hoàng Nam", email: "hoangnam@ictu.edu.vn", department: "Phòng Đào tạo", is_active: true },
    ]);
    render(<MeetingForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Người tổ chức"), { target: { value: "leader@ictu.edu.vn" } });
    fireEvent.click(await screen.findByRole("button", { name: "Mời tất cả mọi người" }));
    expect(screen.getByText("minhanh@ictu.edu.vn")).toBeInTheDocument();
    expect(screen.getByText("hoangnam@ictu.edu.vn")).toBeInTheDocument();
    expect(screen.queryByText("leader@ictu.edu.vn", { selector: ".participant-chip" })).not.toBeInTheDocument();
  });

  it("clears the chosen room when the meeting time changes", async () => {
    render(<MeetingForm onCreated={vi.fn()} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng phù hợp" }));
    await screen.findByText(/Đã tìm thấy 1 phòng phù hợp/);
    fireEvent.click(screen.getByRole("button", { name: /Phòng A101/ }));
    expect(screen.getByText(/Đã chọn/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bắt đầu"), { target: { value: "2026-10-02T09:00" } });
    await waitFor(() => expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument());
  });

  it("keeps form values when the atomic create request fails", async () => {
    vi.mocked(api.createMeeting).mockRejectedValue(new Error("Phòng đã được đặt ở một lần lặp"));
    render(<MeetingForm onCreated={vi.fn()} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Tạo lịch họp" }));
    await screen.findByText("Phòng đã được đặt ở một lần lặp");
    expect(screen.getByLabelText("Tên cuộc họp")).toHaveValue("Họp kiểm thử");
    expect(screen.getByLabelText("Người tổ chức")).toHaveValue("leader@ictu.edu.vn");
  });
});
