import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import type { ChatbotBookingConfirmation, ChatbotBookingDraft, Room } from "../types";
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

const parsedDraft: ChatbotBookingDraft = {
  title: "Họp Sprint 4",
  description: "Đặt lịch qua trợ lý Gemini US25",
  organizer_email: "leader@ictu.edu.vn",
  start_time: "2026-10-20T02:00:00Z",
  end_time: "2026-10-20T03:00:00Z",
  participant_emails: [],
  expected_attendees: 4,
  recurrence: null,
  recurrence_count: 1,
  room_id: null,
  equipment_ids: [],
  reminder_minutes: 30,
};

describe("BookingChatbot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "chatbotAiStatus").mockResolvedValue({
      configured: true,
      provider: "gemini",
      model: "gemini-3.8-flash",
      privacy_notice: "Tin nhắn được gửi tới Gemini; lịch chỉ được ghi sau khi xác nhận.",
    });
  });

  it("uses natural-language conversation before room selection and explicit confirmation", async () => {
    const onCreated = vi.fn();
    vi.spyOn(api, "sendChatbotMessage").mockResolvedValue({
      reply: "Tôi đã hiểu lịch họp. Bạn có thể tìm phòng phù hợp.",
      draft: parsedDraft,
      missing_fields: [],
      ready_for_preview: true,
      provider: "gemini",
      model: "gemini-3.8-flash",
    });
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
    const input = await screen.findByLabelText("Nhắn cho trợ lý Gemini");
    fireEvent.change(input, { target: { value: "Tạo lịch họp Sprint 4 cho 4 người, 9 đến 10 giờ ngày 20/10" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText(/Tôi đã hiểu lịch họp/)).toBeInTheDocument();
    expect(api.sendChatbotMessage).toHaveBeenCalledWith(
      expect.stringContaining("Tạo lịch họp Sprint 4"),
      expect.objectContaining({ organizer_email: "leader@ictu.edu.vn" }),
      expect.any(Array),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng phù hợp" }));
    fireEvent.click(await screen.findByRole("button", { name: /Phòng A101/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đặt phòng" }));

    expect(await screen.findByText("Đặt phòng thành công")).toBeInTheDocument();
    expect(screen.getByText("Cuộc họp #321")).toBeInTheDocument();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(api.confirmChatbotBooking).toHaveBeenCalledWith("signed-confirmation-token-for-test");
  });

  it("shows a clear setup message when Gemini is not configured", async () => {
    vi.mocked(api.chatbotAiStatus).mockResolvedValue({
      configured: false,
      provider: "gemini",
      model: "gemini-3.8-flash",
      privacy_notice: "Tin nhắn được gửi tới Gemini.",
    });

    render(
      <BookingChatbot
        organizerEmail="leader@ictu.edu.vn"
        organizerName="Nguyễn Ngọc Thắng"
        canBook
        onCreated={vi.fn()}
        onViewMeetings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở trợ lý đặt phòng" }));

    expect(await screen.findByText("Gemini chưa được kết nối")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nhắn cho trợ lý Gemini")).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText("Nhắn cho trợ lý Gemini")).not.toBeInTheDocument();
  });
});
