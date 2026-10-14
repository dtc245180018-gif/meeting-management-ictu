import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type {
  ChatbotAiStatus,
  ChatbotBookingConfirmation,
  ChatbotBookingDraft,
  ChatbotBookingPreview,
  ChatbotConversationMessage,
  Room,
} from "../types";
import { formatIctuDateTime } from "../utils/dateTime";

type ChatStage = "chat" | "rooms" | "confirm" | "success";

type ChatMessage = ChatbotConversationMessage & {
  id: number;
};

interface Props {
  organizerEmail: string;
  organizerName: string;
  canBook: boolean;
  onCreated: () => void | Promise<void>;
  onViewMeetings: () => void;
}

const starterSuggestions = [
  "Đặt phòng cho 8 người vào 9 giờ sáng mai, họp trong 1 tiếng",
  "Tạo lịch họp Sprint 4 chiều thứ Sáu và cần máy chiếu",
  "Tôi muốn đặt một cuộc họp lặp hằng tuần",
];

function emptyDraft(organizerEmail: string): ChatbotBookingDraft {
  return {
    title: null,
    description: "Đặt lịch qua trợ lý Gemini US25",
    organizer_email: organizerEmail,
    start_time: null,
    end_time: null,
    participant_emails: [],
    expected_attendees: null,
    recurrence: null,
    recurrence_count: 1,
    room_id: null,
    equipment_ids: [],
    reminder_minutes: 30,
  };
}

function welcomeMessage(organizerName: string, canBook: boolean): string {
  return canBook
    ? `Xin chào ${organizerName}. Bạn cứ nói tự nhiên về cuộc họp cần tạo, tôi sẽ hỏi thêm nếu còn thiếu thông tin.`
    : "Tài khoản của bạn hiện chỉ có quyền tham dự. Hãy liên hệ quản trị viên để được cấp quyền Người đặt lịch trước khi dùng trợ lý.";
}

function roomLabel(room: Room) {
  const position = [room.building, room.floor ? `tầng ${room.floor}` : ""]
    .filter(Boolean)
    .join(" · ");
  return `${room.name} · ${room.capacity} chỗ${position ? ` · ${position}` : ""}`;
}

function draftFacts(draft: ChatbotBookingDraft): string[] {
  const facts: string[] = [];
  if (draft.title) facts.push(draft.title);
  if (draft.start_time && draft.end_time) {
    facts.push(`${formatIctuDateTime(draft.start_time)} – ${formatIctuDateTime(draft.end_time)}`);
  }
  if (draft.expected_attendees) facts.push(`${draft.expected_attendees} người`);
  if (draft.participant_emails.length) facts.push(`${draft.participant_emails.length} người được mời`);
  if (draft.recurrence) {
    facts.push(`${draft.recurrence === "weekly" ? "Hằng tuần" : "Hằng tháng"} · ${draft.recurrence_count} lần`);
  }
  return facts;
}

export function BookingChatbot({
  organizerEmail,
  organizerName,
  canBook,
  onCreated,
  onViewMeetings,
}: Props) {
  const messageId = useRef(1);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const statusRequested = useRef(false);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<ChatStage>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    role: "assistant",
    text: welcomeMessage(organizerName, canBook),
  }]);
  const [draft, setDraft] = useState<ChatbotBookingDraft>(() => emptyDraft(organizerEmail));
  const [input, setInput] = useState("");
  const [aiStatus, setAiStatus] = useState<ChatbotAiStatus | null>(null);
  const [preview, setPreview] = useState<ChatbotBookingPreview | null>(null);
  const [result, setResult] = useState<ChatbotBookingConfirmation | null>(null);
  const [readyForPreview, setReadyForPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState("");

  const addMessages = (...items: Array<Omit<ChatMessage, "id">>) => {
    setMessages((current) => [
      ...current,
      ...items.map((item) => ({ ...item, id: ++messageId.current })),
    ]);
  };

  const resetConversation = () => {
    messageId.current = 0;
    setStage("chat");
    setDraft(emptyDraft(organizerEmail));
    setInput("");
    setPreview(null);
    setResult(null);
    setReadyForPreview(false);
    setLoading(false);
    setError("");
    setMessages([{
      id: ++messageId.current,
      role: "assistant",
      text: welcomeMessage(organizerName, canBook),
    }]);
  };

  useEffect(() => {
    if (!open || !canBook || aiStatus || statusLoading || statusRequested.current) return;
    statusRequested.current = true;
    setStatusLoading(true);
    void api.chatbotAiStatus()
      .then(setAiStatus)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Không thể kiểm tra trạng thái Gemini."))
      .finally(() => setStatusLoading(false));
  }, [open, canBook, aiStatus, statusLoading]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages, stage, error]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = input.trim();
    if (!normalized || loading || !aiStatus?.configured) return;

    const history = messages.slice(-10).map(({ role, text }) => ({ role, text }));
    setInput("");
    setError("");
    setLoading(true);
    addMessages({ role: "user", text: normalized });
    try {
      const response = await api.sendChatbotMessage(normalized, draft, history);
      setDraft(response.draft);
      setReadyForPreview(response.ready_for_preview);
      setPreview(null);
      setStage("chat");
      addMessages({ role: "assistant", text: response.reply });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gemini chưa thể trả lời. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const requestRoomOptions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.previewChatbotBooking({ ...draft, room_id: draft.room_id ?? null });
      setDraft(response.draft);
      setReadyForPreview(response.missing_fields.length === 0);
      setPreview(response);
      addMessages({ role: "assistant", text: response.prompt });
      if (response.ready_to_confirm && response.confirmation_token) {
        setStage("confirm");
      } else if (response.room_options.length) {
        setStage("rooms");
      } else {
        setStage("chat");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tìm phòng phù hợp.");
    } finally {
      setLoading(false);
    }
  };

  const chooseRoom = async (room: Room) => {
    const payload = { ...draft, room_id: room.id };
    setDraft(payload);
    setLoading(true);
    setError("");
    try {
      const response = await api.previewChatbotBooking(payload);
      setPreview(response);
      if (!response.ready_to_confirm || !response.confirmation_token) {
        setError(response.prompt);
        return;
      }
      addMessages(
        { role: "user", text: `Chọn ${roomLabel(room)}` },
        { role: "assistant", text: "Phòng vẫn còn trống. Hãy kiểm tra bản tóm tắt và xác nhận trước khi hệ thống ghi dữ liệu." },
      );
      setStage("confirm");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Phòng vừa chọn không còn phù hợp.");
    } finally {
      setLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!preview?.confirmation_token) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.confirmChatbotBooking(preview.confirmation_token);
      setResult(response);
      const identifiers = response.meetings.map((meeting) => `#${meeting.id}`).join(", ");
      const roomName = response.meetings[0]?.booking?.room.name ?? "phòng đã chọn";
      addMessages({
        role: "assistant",
        text: `${response.message} Mã cuộc họp: ${identifiers}. Phòng: ${roomName}.`,
      });
      setStage("success");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xác nhận đặt phòng.");
    } finally {
      setLoading(false);
    }
  };

  const returnToChat = () => {
    setPreview(null);
    setStage("chat");
    addMessages({ role: "assistant", text: "Bạn muốn thay đổi thông tin nào? Hãy nói tự nhiên, ví dụ “đổi sang 10 giờ sáng mai”." });
  };

  const facts = draftFacts(draft);

  return (
    <div className={`booking-chatbot ${open ? "open" : ""}`}>
      {open && (
        <section className="chatbot-panel" role="dialog" aria-modal="false" aria-labelledby="chatbot-title">
          <header className="chatbot-header">
            <div className="chatbot-avatar" aria-hidden="true">✦</div>
            <div>
              <span>US25 · GEMINI AI</span>
              <strong id="chatbot-title">Trợ lý đặt phòng</strong>
            </div>
            <div className="chatbot-header-actions">
              {canBook && <small className={aiStatus?.configured ? "online" : ""}>
                {statusLoading ? "Đang kiểm tra" : aiStatus?.configured ? "Gemini" : "Chưa kết nối"}
              </small>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý đặt phòng">×</button>
            </div>
          </header>

          <div className="chatbot-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                {message.text}
              </div>
            ))}

            {canBook && aiStatus && !aiStatus.configured && (
              <div className="chatbot-configuration" role="status">
                <strong>Gemini chưa được kết nối</strong>
                <span>Thêm <code>GEMINI_API_KEY</code> vào <code>backend/.env</code> rồi khởi động lại backend.</span>
              </div>
            )}

            {facts.length > 0 && stage !== "success" && (
              <div className="chatbot-draft" aria-label="Thông tin trợ lý đã hiểu">
                <strong>Tôi đang hiểu</strong>
                <div>{facts.map((fact) => <span key={fact}>{fact}</span>)}</div>
              </div>
            )}

            {error && <div className="chatbot-error" role="alert">{error}</div>}

            {canBook && stage === "chat" && aiStatus?.configured && messages.length === 1 && (
              <div className="chatbot-suggestions" aria-label="Câu gợi ý">
                {starterSuggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}

            {canBook && stage === "chat" && aiStatus?.configured && (
              <form className="chatbot-text-composer" onSubmit={(event) => void sendMessage(event)}>
                <label htmlFor="chatbot-message">Nhắn cho trợ lý Gemini</label>
                <textarea
                  id="chatbot-message"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ví dụ: Đặt phòng cho 10 người sáng mai từ 9 đến 10 giờ..."
                  rows={3}
                  disabled={loading}
                />
                <div>
                  {readyForPreview && (
                    <button type="button" className="chatbot-find-room" onClick={() => void requestRoomOptions()} disabled={loading}>
                      {loading ? "Đang xử lý..." : "Tìm phòng phù hợp"}
                    </button>
                  )}
                  <button type="submit" disabled={loading || !input.trim()}>{loading ? "Gemini đang trả lời..." : "Gửi"}</button>
                </div>
              </form>
            )}

            {canBook && stage === "rooms" && (
              <div className="chatbot-room-options">
                {preview?.room_options.map((room) => (
                  <button type="button" key={room.id} onClick={() => void chooseRoom(room)} disabled={loading}>
                    <strong>{room.name}</strong>
                    <span>{room.capacity} chỗ · {room.location}</span>
                    <small>{[room.building, room.floor ? `Tầng ${room.floor}` : ""].filter(Boolean).join(" · ")}</small>
                  </button>
                ))}
                <button type="button" className="chatbot-secondary" onClick={returnToChat}>Thay đổi bằng hội thoại</button>
              </div>
            )}

            {canBook && stage === "confirm" && preview && (
              <div className="chatbot-confirmation">
                <strong>Bản tóm tắt đặt phòng</strong>
                <p>{preview.summary}</p>
                {preview.expires_at && <small>Xác nhận trước {formatIctuDateTime(preview.expires_at)}</small>}
                <div>
                  <button type="button" onClick={() => void confirmBooking()} disabled={loading}>{loading ? "Đang xác nhận..." : "Xác nhận đặt phòng"}</button>
                  <button type="button" className="chatbot-secondary" onClick={returnToChat}>Thay đổi thông tin</button>
                </div>
              </div>
            )}

            {canBook && stage === "success" && result && (
              <div className="chatbot-success">
                <strong>Đặt phòng thành công</strong>
                {result.meetings.map((meeting) => (
                  <div key={meeting.id}>
                    <b>Cuộc họp #{meeting.id}</b>
                    <span>{meeting.booking?.room.name ?? "Chưa có phòng"}</span>
                    <small>{formatIctuDateTime(meeting.start_time)}</small>
                  </div>
                ))}
                <div className="chatbot-success-actions">
                  <button type="button" onClick={resetConversation}>Đặt phòng khác</button>
                  <button type="button" className="chatbot-secondary" onClick={() => { setOpen(false); onViewMeetings(); }}>Xem lịch họp</button>
                </div>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          <footer className="chatbot-footer">
            <span>{aiStatus?.privacy_notice ?? "Dữ liệu chỉ được ghi sau khi bạn xác nhận."}</span>
            {canBook && stage !== "success" && <button type="button" onClick={resetConversation}>Làm mới</button>}
          </footer>
        </section>
      )}

      <button
        className="chatbot-launcher"
        type="button"
        aria-label={open ? "Đóng trợ lý đặt phòng" : "Mở trợ lý đặt phòng"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span>
        <strong>{open ? "Đóng" : "Trợ lý AI"}</strong>
      </button>
    </div>
  );
}
