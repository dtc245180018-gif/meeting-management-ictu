import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type {
  ChatbotBookingConfirmation,
  ChatbotBookingDraft,
  ChatbotBookingPreview,
  Equipment,
  Room,
} from "../types";
import { formatIctuDateTime, ictuInputToIso } from "../utils/dateTime";

type ChatStep =
  | "title"
  | "time"
  | "participants"
  | "attendees"
  | "recurrence"
  | "equipment"
  | "rooms"
  | "confirm"
  | "success";

type ChatMessage = {
  id: number;
  sender: "assistant" | "user";
  text: string;
};

interface Props {
  organizerEmail: string;
  organizerName: string;
  canBook: boolean;
  onCreated: () => void | Promise<void>;
  onViewMeetings: () => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyDraft(organizerEmail: string): ChatbotBookingDraft {
  return {
    title: null,
    description: "Đặt nhanh qua chatbot US25",
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

function parseEmails(value: string, organizerEmail: string) {
  return [...new Set(
    value
      .split(/[;,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && email !== organizerEmail.toLowerCase()),
  )];
}

function roomLabel(room: Room) {
  const position = [room.building, room.floor ? `tầng ${room.floor}` : ""]
    .filter(Boolean)
    .join(" · ");
  return `${room.name} · ${room.capacity} chỗ${position ? ` · ${position}` : ""}`;
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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ChatStep>("title");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    sender: "assistant",
    text: canBook
      ? `Xin chào ${organizerName}. Tôi sẽ giúp bạn tạo lịch và đặt phòng mà không cần mở biểu mẫu. Cuộc họp có tên gì?`
      : "Tài khoản của bạn hiện chỉ có quyền tham dự. Hãy liên hệ quản trị viên để được cấp quyền Người đặt lịch trước khi dùng chatbot.",
  }]);
  const [draft, setDraft] = useState<ChatbotBookingDraft>(() => emptyDraft(organizerEmail));
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [participantInput, setParticipantInput] = useState("");
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly">("none");
  const [recurrenceCount, setRecurrenceCount] = useState(2);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<ChatbotBookingPreview | null>(null);
  const [result, setResult] = useState<ChatbotBookingConfirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addMessages = (...items: Array<Omit<ChatMessage, "id">>) => {
    setMessages((current) => [
      ...current,
      ...items.map((item) => ({ ...item, id: ++messageId.current })),
    ]);
  };

  const resetConversation = () => {
    messageId.current = 0;
    setStep("title");
    setDraft(emptyDraft(organizerEmail));
    setTitle("");
    setStartTime("");
    setEndTime("");
    setParticipantInput("");
    setAttendeeCount(1);
    setRecurrence("none");
    setRecurrenceCount(2);
    setSelectedEquipmentIds([]);
    setPreview(null);
    setResult(null);
    setLoading(false);
    setError("");
    setMessages([{
      id: ++messageId.current,
      sender: "assistant",
      text: canBook
        ? `Xin chào ${organizerName}. Tôi sẽ giúp bạn tạo lịch và đặt phòng mà không cần mở biểu mẫu. Cuộc họp có tên gì?`
        : "Tài khoản của bạn hiện chỉ có quyền tham dự. Hãy liên hệ quản trị viên để được cấp quyền Người đặt lịch trước khi dùng chatbot.",
    }]);
  };

  useEffect(() => {
    if (!open || !canBook || equipment.length) return;
    void api.listEquipment()
      .then((items) => setEquipment(items.filter((item) => item.is_active && item.status !== "maintenance" && item.status !== "inactive")))
      .catch(() => setEquipment([]));
  }, [open, canBook, equipment.length]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages, step, error]);

  const submitTitle = (event: FormEvent) => {
    event.preventDefault();
    const normalized = title.trim();
    if (normalized.length < 3) {
      setError("Tên cuộc họp phải có ít nhất 3 ký tự.");
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, title: normalized }));
    addMessages(
      { sender: "user", text: normalized },
      { sender: "assistant", text: "Bạn muốn họp từ lúc nào đến lúc nào? Thời gian hiển thị theo giờ Việt Nam." },
    );
    setStep("time");
  };

  const submitTime = (event: FormEvent) => {
    event.preventDefault();
    if (!startTime || !endTime) {
      setError("Hãy chọn đầy đủ thời gian bắt đầu và kết thúc.");
      return;
    }
    const startIso = ictuInputToIso(startTime);
    const endIso = ictuInputToIso(endTime);
    if (new Date(endIso) <= new Date(startIso)) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, start_time: startIso, end_time: endIso }));
    addMessages(
      { sender: "user", text: `${formatIctuDateTime(startIso)} – ${formatIctuDateTime(endIso)}` },
      { sender: "assistant", text: "Bạn muốn mời ai? Có thể nhập nhiều email, ngăn cách bằng dấu phẩy; hoặc bỏ qua." },
    );
    setStep("participants");
  };

  const submitParticipants = (event: FormEvent) => {
    event.preventDefault();
    const participants = parseEmails(participantInput, organizerEmail);
    const invalid = participants.find((email) => !emailPattern.test(email));
    if (invalid) {
      setError(`Email không hợp lệ: ${invalid}`);
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, participant_emails: participants }));
    const minimum = participants.length + 1;
    setAttendeeCount((current) => Math.max(current, minimum));
    addMessages(
      { sender: "user", text: participants.length ? participants.join(", ") : "Không mời thêm người" },
      { sender: "assistant", text: `Tổng số người dự kiến là bao nhiêu? Tối thiểu ${minimum} người, gồm cả bạn.` },
    );
    setStep("attendees");
  };

  const submitAttendees = (event: FormEvent) => {
    event.preventDefault();
    const minimum = draft.participant_emails.length + 1;
    if (!Number.isInteger(attendeeCount) || attendeeCount < minimum) {
      setError(`Số người dự kiến phải từ ${minimum} trở lên.`);
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, expected_attendees: attendeeCount }));
    addMessages(
      { sender: "user", text: `${attendeeCount} người` },
      { sender: "assistant", text: "Cuộc họp có lặp lại không?" },
    );
    setStep("recurrence");
  };

  const submitRecurrence = (event: FormEvent) => {
    event.preventDefault();
    const normalizedRecurrence = recurrence === "none" ? null : recurrence;
    const count = normalizedRecurrence ? recurrenceCount : 1;
    if (normalizedRecurrence && (count < 2 || count > 24)) {
      setError("Số lần lặp phải từ 2 đến 24.");
      return;
    }
    setError("");
    setDraft((current) => ({
      ...current,
      recurrence: normalizedRecurrence,
      recurrence_count: count,
    }));
    const recurrenceText = normalizedRecurrence
      ? `${normalizedRecurrence === "weekly" ? "Hằng tuần" : "Hằng tháng"}, ${count} lần`
      : "Không lặp";
    addMessages(
      { sender: "user", text: recurrenceText },
      { sender: "assistant", text: "Bạn có cần thiết bị nào cho cuộc họp không?" },
    );
    setStep("equipment");
  };

  const requestRoomOptions = async (equipmentIds: number[]) => {
    const payload = { ...draft, equipment_ids: equipmentIds, room_id: null };
    setDraft(payload);
    setLoading(true);
    setError("");
    try {
      const response = await api.previewChatbotBooking(payload);
      setPreview(response);
      addMessages(
        {
          sender: "user",
          text: equipmentIds.length
            ? equipment.filter((item) => equipmentIds.includes(item.id)).map((item) => item.name).join(", ")
            : "Không cần thiết bị",
        },
        { sender: "assistant", text: response.prompt },
      );
      setStep("rooms");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tìm phòng phù hợp.");
    } finally {
      setLoading(false);
    }
  };

  const submitEquipment = (event: FormEvent) => {
    event.preventDefault();
    void requestRoomOptions(selectedEquipmentIds);
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
        { sender: "user", text: roomLabel(room) },
        { sender: "assistant", text: "Tôi đã kiểm tra lại quyền và tài nguyên. Hãy xem bản tóm tắt rồi xác nhận." },
      );
      setStep("confirm");
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
        sender: "assistant",
        text: `${response.message} Mã cuộc họp: ${identifiers}. Phòng: ${roomName}.`,
      });
      setStep("success");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xác nhận đặt phòng.");
    } finally {
      setLoading(false);
    }
  };

  const toggleEquipment = (equipmentId: number) => {
    setSelectedEquipmentIds((current) => current.includes(equipmentId)
      ? current.filter((id) => id !== equipmentId)
      : [...current, equipmentId]);
  };

  const cancel = () => {
    resetConversation();
    setOpen(false);
  };

  return (
    <div className={`booking-chatbot ${open ? "open" : ""}`}>
      {open && (
        <section className="chatbot-panel" role="dialog" aria-modal="false" aria-labelledby="chatbot-title">
          <header className="chatbot-header">
            <div className="chatbot-avatar" aria-hidden="true">✦</div>
            <div>
              <span>US25 · SPRINT 4</span>
              <strong id="chatbot-title">Trợ lý đặt phòng</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý đặt phòng">×</button>
          </header>

          <div className="chatbot-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`chat-message ${message.sender}`} key={message.id}>
                {message.text}
              </div>
            ))}
            {error && <div className="chatbot-error" role="alert">{error}</div>}

            {canBook && step === "title" && (
              <form className="chatbot-composer" onSubmit={submitTitle}>
                <label>Tên cuộc họp
                  <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Họp triển khai Sprint 4" />
                </label>
                <button type="submit">Tiếp tục</button>
              </form>
            )}

            {canBook && step === "time" && (
              <form className="chatbot-composer" onSubmit={submitTime}>
                <label>Bắt đầu
                  <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                </label>
                <label>Kết thúc
                  <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </label>
                <button type="submit">Tiếp tục</button>
              </form>
            )}

            {canBook && step === "participants" && (
              <form className="chatbot-composer" onSubmit={submitParticipants}>
                <label>Email người tham dự
                  <textarea value={participantInput} onChange={(event) => setParticipantInput(event.target.value)} placeholder="email1@ictu.edu.vn, email2@ictu.edu.vn" rows={3} />
                </label>
                <button type="submit">{participantInput.trim() ? "Tiếp tục" : "Bỏ qua"}</button>
              </form>
            )}

            {canBook && step === "attendees" && (
              <form className="chatbot-composer" onSubmit={submitAttendees}>
                <label>Số người dự kiến
                  <input type="number" min={draft.participant_emails.length + 1} max={10000} value={attendeeCount} onChange={(event) => setAttendeeCount(Number(event.target.value))} />
                </label>
                <button type="submit">Tiếp tục</button>
              </form>
            )}

            {canBook && step === "recurrence" && (
              <form className="chatbot-composer" onSubmit={submitRecurrence}>
                <label>Lặp lại
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}>
                    <option value="none">Không lặp</option>
                    <option value="weekly">Hằng tuần</option>
                    <option value="monthly">Hằng tháng</option>
                  </select>
                </label>
                {recurrence !== "none" && <label>Số lần
                  <input type="number" min={2} max={24} value={recurrenceCount} onChange={(event) => setRecurrenceCount(Number(event.target.value))} />
                </label>}
                <button type="submit">Tiếp tục</button>
              </form>
            )}

            {canBook && step === "equipment" && (
              <form className="chatbot-composer" onSubmit={submitEquipment}>
                <fieldset className="chatbot-equipment">
                  <legend>Thiết bị cần dùng</legend>
                  {equipment.length === 0 && <span>Không có thiết bị khả dụng hoặc bạn có thể bỏ qua.</span>}
                  {equipment.map((item) => (
                    <label key={item.id}>
                      <input type="checkbox" checked={selectedEquipmentIds.includes(item.id)} onChange={() => toggleEquipment(item.id)} />
                      <span><strong>{item.name}</strong><small>{item.code} · {item.category}</small></span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" disabled={loading}>{loading ? "Đang tìm phòng..." : "Tìm phòng phù hợp"}</button>
              </form>
            )}

            {canBook && step === "rooms" && (
              <div className="chatbot-room-options">
                {preview?.room_options.map((room) => (
                  <button type="button" key={room.id} onClick={() => void chooseRoom(room)} disabled={loading}>
                    <strong>{room.name}</strong>
                    <span>{room.capacity} chỗ · {room.location}</span>
                    <small>{[room.building, room.floor ? `Tầng ${room.floor}` : ""].filter(Boolean).join(" · ")}</small>
                  </button>
                ))}
                {!preview?.room_options.length && <button type="button" className="chatbot-secondary" onClick={resetConversation}>Chọn thông tin khác</button>}
              </div>
            )}

            {canBook && step === "confirm" && preview && (
              <div className="chatbot-confirmation">
                <strong>Bản tóm tắt đặt phòng</strong>
                <p>{preview.summary}</p>
                {preview.expires_at && <small>Xác nhận trước {formatIctuDateTime(preview.expires_at)}</small>}
                <div>
                  <button type="button" onClick={() => void confirmBooking()} disabled={loading}>{loading ? "Đang xác nhận..." : "Xác nhận đặt phòng"}</button>
                  <button type="button" className="chatbot-secondary" onClick={cancel}>Hủy thao tác</button>
                </div>
              </div>
            )}

            {canBook && step === "success" && result && (
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
                  <button type="button" onClick={() => { resetConversation(); }}>Đặt phòng khác</button>
                  <button type="button" className="chatbot-secondary" onClick={() => { setOpen(false); onViewMeetings(); }}>Xem lịch họp</button>
                </div>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          <footer className="chatbot-footer">
            <span>Dữ liệu chỉ được ghi sau khi bạn xác nhận.</span>
            {canBook && step !== "success" && <button type="button" onClick={cancel}>Hủy</button>}
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
        <strong>{open ? "Đóng" : "Đặt phòng nhanh"}</strong>
      </button>
    </div>
  );
}
