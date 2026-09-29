import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Employee, MeetingInput, Room, SuggestedTime } from "../types";
import { api } from "../services/api";

const initialForm: MeetingInput = {
  title: "",
  description: "",
  organizer_email: "",
  start_time: "",
  end_time: "",
  participant_emails: [],
  expected_attendees: 1,
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
  const [participantInput, setParticipantInput] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [participantError, setParticipantError] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedTime[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roomOptions, setRoomOptions] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);

  const clearRoomSelection = () => {
    setSelectedRoom(null);
    setRoomOptions([]);
  };

  const updateForm = (changes: Partial<MeetingInput>, invalidateRoom = false) => {
    if (invalidateRoom) clearRoomSelection();
    setForm((current) => ({ ...current, ...changes }));
  };

  useEffect(() => {
    void api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const participants = useMemo(
    () => selectedParticipants.filter((email) => email !== form.organizer_email.trim().toLowerCase()),
    [selectedParticipants, form.organizer_email],
  );

  const employeeSuggestions = useMemo(() => {
    const query = participantInput.trim().toLowerCase();
    if (!query) return [];
    return employees
      .filter((employee) => employee.email !== form.organizer_email.trim().toLowerCase())
      .filter((employee) => `${employee.full_name} ${employee.email} ${employee.department}`.toLowerCase().includes(query))
      .filter((employee) => !selectedParticipants.includes(employee.email))
      .slice(0, 6);
  }, [employees, form.organizer_email, participantInput, selectedParticipants]);

  const organizerSuggestions = useMemo(() => {
    const query = form.organizer_email.trim().toLowerCase();
    if (!query) return [];
    return employees
      .filter((employee) => `${employee.full_name} ${employee.email} ${employee.department}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [employees, form.organizer_email]);

  const addParticipants = (value: string) => {
    const emails = value.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!emails.length) return;
    const invalid = emails.find((email) => !emailPattern.test(email));
    if (invalid) {
      setParticipantError(`Email không hợp lệ: ${invalid}`);
      return;
    }
    setParticipantError("");
    clearRoomSelection();
    setSelectedParticipants((current) => [...new Set([...current, ...emails])]);
    setParticipantInput("");
  };

  const commitPendingParticipant = () => {
    if (!participantInput.trim()) return true;
    const emails = participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const invalid = emails.find((email) => !emailPattern.test(email));
    if (invalid) {
      setParticipantError(`Email không hợp lệ: ${invalid}`);
      return false;
    }
    clearRoomSelection();
    setSelectedParticipants((current) => [...new Set([...current, ...emails])]);
    setParticipantInput("");
    setParticipantError("");
    return true;
  };

  const inviteAllEmployees = () => {
    const organizer = form.organizer_email.trim().toLowerCase();
    if (!emailPattern.test(organizer)) {
      setMessage("Hãy chọn hoặc nhập email người tổ chức trước khi mời tất cả nhân viên.");
      return;
    }
    const pending = participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const invalid = pending.find((email) => !emailPattern.test(email));
    if (invalid) {
      setParticipantError(`Email không hợp lệ: ${invalid}`);
      return;
    }
    const invitees = [...new Set([
      ...selectedParticipants,
      ...pending,
      ...employees.map((employee) => employee.email.toLowerCase()),
    ])].filter((email) => email !== organizer);
    clearRoomSelection();
    setSelectedParticipants(invitees);
    setParticipantInput("");
    setParticipantError("");
    setMessage(`Đã thêm ${invitees.length} người tham dự, không bao gồm người tổ chức.`);
  };

  const submittedParticipants = () => {
    const pending = participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    return [...new Set([...selectedParticipants, ...pending])]
      .filter((email) => email !== form.organizer_email.trim().toLowerCase());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const currentParticipants = submittedParticipants();
      const pendingInvalid = participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean).find((email) => !emailPattern.test(email));
      if (pendingInvalid) {
        setParticipantError(`Email không hợp lệ: ${pendingInvalid}`);
        return;
      }
      if (participantInput.trim()) {
        clearRoomSelection();
        setSelectedParticipants((current) => [...new Set([...current, ...participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean)])]);
        setParticipantInput("");
      }
      const validationError = validateForm(form, currentParticipants);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const created = await api.createMeeting({
        ...form,
        organizer_email: form.organizer_email.trim(),
        start_time: toIsoDateTime(form.start_time),
        end_time: toIsoDateTime(form.end_time),
        participant_emails: currentParticipants,
        expected_attendees: currentParticipants.length + 1,
        room_id: selectedRoom?.id ?? null,
      });
      setMessage(selectedRoom
        ? `Đã tạo ${created.length} lịch họp, ghi nhận ${currentParticipants.length} lời mời và đặt ${selectedRoom.name} cho toàn bộ lần lặp thành công.`
        : `Đã tạo ${created.length} lịch họp thành công và ghi nhận ${currentParticipants.length} lời mời người tham dự.`);
      setForm(initialForm);
      setParticipantInput("");
      setSelectedParticipants([]);
      setParticipantError("");
      clearRoomSelection();
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
    updateForm({ start_time: toLocal(suggestion.start_time), end_time: toLocal(suggestion.end_time) }, true);
    setSuggestions([]);
  };

  const openRoomFinder = () => {
    const start = new Date(form.start_time);
    const end = new Date(form.end_time);
    if (!form.start_time || !form.end_time || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage("Hãy chọn thời gian hợp lệ trước khi tìm phòng.");
      return;
    }
    const currentParticipants = submittedParticipants();
    const invalid = currentParticipants.find((email) => !emailPattern.test(email));
    if (invalid) {
      setParticipantError(`Email không hợp lệ: ${invalid}`);
      return;
    }
    setRoomLoading(true);
    setMessage("");
    void api.availableRooms(toIsoDateTime(form.start_time), toIsoDateTime(form.end_time), Math.max(currentParticipants.length + 1, 1))
      .then((rooms) => {
        setRoomOptions(rooms);
        setSelectedRoom(null);
        setMessage(rooms.length ? `Đã tìm thấy ${rooms.length} phòng phù hợp. Chọn một phòng rồi bấm Tạo lịch họp.` : "Không có phòng phù hợp trong khung giờ và quy mô này.");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Không thể tìm phòng phù hợp"))
      .finally(() => setRoomLoading(false));
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
          <input required minLength={3} value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="Ví dụ: Daily Meeting Sprint 1" />
        </label>
        <label className="full">Mô tả
          <textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Nội dung và mục tiêu cuộc họp" />
        </label>
        <label>Người tổ chức
          <input aria-label="Người tổ chức" required list="ictu-employees" type="email" value={form.organizer_email} onChange={(e) => updateForm({ organizer_email: e.target.value }, true)} placeholder="Chọn hoặc nhập email nhân viên ICTU" />
          {organizerSuggestions.length > 0 && (
            <div className="employee-suggestions" role="listbox" aria-label="Gợi ý người tổ chức">
              {organizerSuggestions.map((employee) => (
                <button type="button" key={employee.email} onClick={() => updateForm({ organizer_email: employee.email }, true)}>
                  <strong>{employee.full_name}</strong>
                  <span>{employee.email} · {employee.department}</span>
                </button>
              ))}
            </div>
          )}
          <small className="field-hint">Nhân viên ICTU có thể đứng tên tổ chức cuộc họp.</small>
        </label>
        <div className="participant-field">
          <div className="participant-label-row">
            <span>Người tham dự</span>
            <button className="invite-all-button" type="button" onClick={inviteAllEmployees}>Mời tất cả mọi người</button>
          </div>
          <input
            aria-label="Người tham dự"
            value={participantInput}
            onChange={(event) => {
              if (/[;,\n]/.test(event.target.value)) {
                addParticipants(event.target.value);
              } else {
                clearRoomSelection();
                setParticipantInput(event.target.value);
                setParticipantError("");
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "," || event.key === ";") {
                event.preventDefault();
                addParticipants(participantInput);
              }
            }}
            onBlur={() => { commitPendingParticipant(); }}
            placeholder="Gõ tên hoặc email rồi nhấn Enter"
            aria-autocomplete="list"
          />
          {employeeSuggestions.length > 0 && (
            <div className="employee-suggestions" role="listbox" aria-label="Gợi ý người tham dự">
              {employeeSuggestions.map((employee) => (
                <button key={employee.email} type="button" onClick={() => addParticipants(employee.email)}>
                  <strong>{employee.full_name}</strong>
                  <span>{employee.email} · {employee.department}</span>
                </button>
              ))}
            </div>
          )}
          {participants.length > 0 && (
            <div className="participant-chips" aria-label="Người tham dự đã chọn">
              {participants.map((email) => (
                <span className="participant-chip" key={email}>
                  {email}
                  <button type="button" aria-label={`Xóa ${email}`} onClick={() => { clearRoomSelection(); setSelectedParticipants((current) => current.filter((item) => item !== email)); }}>×</button>
                </span>
              ))}
            </div>
          )}
          {participantError && <small className="field-error">{participantError}</small>}
        </div>
        <label>Bắt đầu
          <input required type="datetime-local" value={form.start_time} onChange={(e) => updateForm({ start_time: e.target.value }, true)} />
        </label>
        <label>Kết thúc
          <input required type="datetime-local" value={form.end_time} onChange={(e) => updateForm({ end_time: e.target.value }, true)} />
        </label>
        <label>Lặp lại
          <select value={form.recurrence ?? ""} onChange={(e) => updateForm({ recurrence: (e.target.value || null) as MeetingInput["recurrence"] }, true)}>
            <option value="">Không lặp</option>
            <option value="weekly">Hằng tuần</option>
            <option value="monthly">Hằng tháng</option>
          </select>
        </label>
        <label>Số lần
          <input type="number" min={1} max={24} disabled={!form.recurrence} value={form.recurrence_count} onChange={(e) => updateForm({ recurrence_count: Number(e.target.value) }, true)} />
        </label>
        <div className="full action-row">
          <button className="button secondary" type="button" onClick={findSuggestions} disabled={loading}>Gợi ý giờ trống</button>
          <button className="button secondary" type="button" onClick={openRoomFinder} disabled={roomLoading}>{roomLoading ? "Đang tìm phòng..." : "Tìm phòng phù hợp"}</button>
          <button className="button primary" type="submit" disabled={loading}>{loading ? "Đang xử lý..." : "Tạo lịch họp"}</button>
        </div>
      </form>
      {roomOptions.length > 0 && (
        <div className="room-options" aria-label="Phòng phù hợp cho cuộc họp">
          <strong>Chọn phòng để đặt cùng lúc tạo lịch</strong>
          {roomOptions.map((room) => (
            <button className={selectedRoom?.id === room.id ? "selected" : ""} key={room.id} type="button" onClick={() => setSelectedRoom(room)}>
              <strong>{room.name}{selectedRoom?.id === room.id ? " · Đã chọn" : ""}</strong>
              <span>{room.capacity} chỗ · {room.location} · {room.room_type}</span>
            </button>
          ))}
        </div>
      )}
      <p className="subtle">Quy mô phòng tự tính: {participants.length + 1} người, gồm người tổ chức và danh sách được mời.</p>
      <datalist id="ictu-employees">{employees.map((employee) => <option key={employee.email} value={employee.email}>{employee.full_name} · {employee.department}</option>)}</datalist>
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
