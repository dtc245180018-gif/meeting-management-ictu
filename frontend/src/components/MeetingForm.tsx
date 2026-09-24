import { FormEvent, useMemo, useState } from "react";
import type { MeetingInput, SuggestedTime } from "../types";
import { api } from "../services/api";

const initialForm: MeetingInput = {
  title: "",
  description: "",
  organizer_email: "",
  start_time: "",
  end_time: "",
  participant_emails: [],
  recurrence: null,
  recurrence_count: 1,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function validateForm(form: MeetingInput, participants: string[]) {
  if (!form.title.trim() || form.title.trim().length < 3) return "Tên cuộc họp phải có ít nhất 3 ký tự.";
  if (!emailPattern.test(form.organizer_email.trim())) return "Email người tổ chức không hợp lệ.";
  if (participants.some((email) => !emailPattern.test(email))) return "Email người tham dự không hợp lệ.";
  if (!form.start_time || !form.end_time) return "Hãy chọn thời gian bắt đầu và kết thúc.";

  const start = new Date(form.start_time);
  const end = new Date(form.end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Thời gian cuộc họp không hợp lệ.";
  if (end <= start) return "Thời gian kết thúc phải sau thời gian bắt đầu.";
  return null;
}

interface Props {
  onCreated: () => void;
}

export function MeetingForm({ onCreated }: Props) {
  const [form, setForm] = useState(initialForm);
  const [participantText, setParticipantText] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedTime[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const participants = useMemo(
    () => participantText.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean),
    [participantText],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const validationError = validateForm(form, participants);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const created = await api.createMeeting({
        ...form,
        organizer_email: form.organizer_email.trim(),
        start_time: toIsoDateTime(form.start_time),
        end_time: toIsoDateTime(form.end_time),
        participant_emails: participants,
      });
      setMessage(`Đã tạo ${created.length} lịch họp thành công và ghi nhận ${participants.length} lời mời người tham dự.`);
      setForm(initialForm);
      setParticipantText("");
      setSuggestions([]);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const findSuggestions = async () => {
    const validationError = validateForm({ ...form, title: form.title || "Tìm giờ họp" }, participants);
    if (validationError === "Tên cuộc họp phải có ít nhất 3 ký tự.") {
      setMessage("Hãy nhập người tổ chức, người tham dự và khoảng thời gian tìm kiếm.");
      return;
    }
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await api.suggestTimes(
        [form.organizer_email, ...participants].filter(Boolean),
        new Date(form.start_time).toISOString(),
        new Date(form.end_time).toISOString(),
      );
      setSuggestions(result);
      if (!result.length) setMessage("Không tìm thấy khung giờ chung phù hợp.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể gợi ý thời gian");
    } finally {
      setLoading(false);
    }
  };

  const chooseSuggestion = (suggestion: SuggestedTime) => {
    const toLocal = (value: string) => {
      const date = new Date(value);
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
    };
    setForm({ ...form, start_time: toLocal(suggestion.start_time), end_time: toLocal(suggestion.end_time) });
    setSuggestions([]);
  };

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">US01 · US03 · US04 · US05</span>
          <h2>Tạo lịch họp</h2>
        </div>
        <span className="badge">Sprint 1</span>
      </div>
      <form onSubmit={submit} className="form-grid">
        <label className="full">Tên cuộc họp
          <input required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ví dụ: Daily Meeting Sprint 1" />
        </label>
        <label className="full">Mô tả
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Nội dung và mục tiêu cuộc họp" />
        </label>
        <label>Người tổ chức
          <input required type="email" value={form.organizer_email} onChange={(e) => setForm({ ...form, organizer_email: e.target.value })} placeholder="leader@ictu.edu.vn" />
        </label>
        <label>Người tham dự
          <input value={participantText} onChange={(e) => setParticipantText(e.target.value)} placeholder="email1; email2" />
        </label>
        <label>Bắt đầu
          <input required type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </label>
        <label>Kết thúc
          <input required type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
        </label>
        <label>Lặp lại
          <select value={form.recurrence ?? ""} onChange={(e) => setForm({ ...form, recurrence: (e.target.value || null) as MeetingInput["recurrence"] })}>
            <option value="">Không lặp</option>
            <option value="weekly">Hằng tuần</option>
            <option value="monthly">Hằng tháng</option>
          </select>
        </label>
        <label>Số lần
          <input type="number" min={1} max={24} disabled={!form.recurrence} value={form.recurrence_count} onChange={(e) => setForm({ ...form, recurrence_count: Number(e.target.value) })} />
        </label>
        <div className="full action-row">
          <button className="button secondary" type="button" onClick={findSuggestions} disabled={loading}>Gợi ý giờ trống</button>
          <button className="button primary" type="submit" disabled={loading}>{loading ? "Đang xử lý..." : "Tạo lịch họp"}</button>
        </div>
      </form>
      {suggestions.length > 0 && (
        <div className="suggestions">
          <strong>Khung giờ đề xuất</strong>
          {suggestions.map((item) => (
            <button key={item.start_time} onClick={() => chooseSuggestion(item)}>
              {new Date(item.start_time).toLocaleString("vi-VN")} - {new Date(item.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </button>
          ))}
        </div>
      )}
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
