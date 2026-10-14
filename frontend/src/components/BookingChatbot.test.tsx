import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import type { ChatbotBookingConfirmation, Room } from "../types";
import { BookingChatbot } from "./BookingChatbot";

const room: Room = {
  id: 11,
  name: "Phòng A101",
  capacity: 20,
  location: "Cơ sở chính",
  building: "Nhà A",
  floor: 1,
  is_active: true,
  can_book: true,
};

describe("BookingChatbot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "listEquipment").mockResolvedValue([]);
  });

  it("guides an organizer through room selection and explicit confirmation", async () => {
    const onCreated = vi.fn();
    vi.spyOn(api, "previewChatbotBooking").mockImplementation(async (draft) => {
      if (!draft.room_id) {
        return {
          ready_to_confirm: false,
          prompt: "Đã tìm thấy 1 phòng phù hợp. Hãy chọn một phòng để xác nhận.",
          missing_fields: ["room_id"],
          draft,
          room_options: [room],
        };
      }
      return {
        ready_to_confirm: true,
        prompt: "Thông tin hợp lệ. Vui lòng xác nhận.",
        missing_fields: [],
        draft,
        room_options: [room],
        summary: "Họp Sprint 4, 4 người, phòng A101.",
        confirmation_token: "signed-confirmation-token-for-test",
        expires_at: "2026-10-20T02:10:00Z",
      };
    });
    vi.spyOn(api, "confirmChatbotBooking").mockResolvedValue({
      message: "Đã tạo 1 lịch họp và đặt phòng thành công.",
      meetings: [{
        id: 321,
        title: "Họp Sprint 4",
        organizer_email: "leader@ictu.edu.vn",
        start_time: "2026-10-20T02:00:00Z",
        end_time: "2026-10-20T03:00:00Z",
        status: "scheduled",
        participants: [],
        booking: {
          id: 91,
          room_id: room.id,
          meeting_id: 321,
          start_time: "2026-10-20T02:00:00Z",
          end_time: "2026-10-20T03:00:00Z",
          status: "active",
          room,
        },
      }],
    } satisfies ChatbotBookingConfirmation);

    render(
      <BookingChatbot
        organizerEmail="leader@ictu.edu.vn"
        organizerName="Nguyễn Ngọc Thắng"
        canBook
        onCreated={onCreated}
        onViewMeetings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý đặt phòng" }));
    fireEvent.change(screen.getByLabelText("Tên cuộc họp"), { target: { value: "Họp Sprint 4" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    fireEvent.change(screen.getByLabelText("Bắt đầu"), { target: { value: "2026-10-20T09:00" } });
    fireEvent.change(screen.getByLabelText("Kết thúc"), { target: { value: "2026-10-20T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    fireEvent.change(screen.getByLabelText("Số người dự kiến"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng phù hợp" }));

    fireEvent.click(await screen.findByRole("button", { name: /Phòng A101/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đặt phòng" }));

    expect(await screen.findByText("Đặt phòng thành công")).toBeInTheDocument();
    expect(screen.getByText("Cuộc họp #321")).toBeInTheDocument();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.confirmChatbotBooking).toHaveBeenCalledWith("signed-confirmation-token-for-test");
  });

  it("explains the missing booking permission to participant accounts", () => {
    render(
      <BookingChatbot
        organizerEmail="member@ictu.edu.vn"
        organizerName="Nhân viên"
        canBook={false}
        onCreated={vi.fn()}
        onViewMeetings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý đặt phòng" }));

    expect(screen.getByText(/chỉ có quyền tham dự/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Tên cuộc họp")).not.toBeInTheDocument();
  });
});
