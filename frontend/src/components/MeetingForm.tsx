import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Employee, Equipment, MeetingInput, Room, SuggestedTime } from "../types";
import { api } from "../services/api";
import { formatIctuDateTime, formatIctuTime, ictuInputToIso, toIctuDateTimeInput } from "../utils/dateTime";

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
  equipment_ids: [],
  reminder_minutes: null,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toIsoDateTime(value: string) {
  return ictuInputToIso(value);
}

function validateForm(form: MeetingInput, participants: string[]) {
  if (!form.title.trim() || form.title.trim().length < 3) return "Tên cuộc họp phải có ít nhất 3 ký tự.";
  if (!emailPattern.test(form.organizer_email.trim())) return "Email người tổ chức không hợp lệ.";
  if (participants.some((email) => !emailPattern.test(email))) return "Email người tham dự không hợp lệ.";
  if (!Number.isInteger(form.expected_attendees) || form.expected_attendees < participants.length + 1) {
    return "Số người dự kiến phải ít nhất bằng người tổ chức và số người được mời.";
  }
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
  const [equipmentOptions, setEquipmentOptions] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);

  const clearRoomSelection = () => {
    setSelectedRoom(null);
    setRoomOptions([]);
  };

  const clearResourceSelection = () => {
    clearRoomSelection();
    setSelectedEquipment([]);
    setEquipmentOptions([]);
  };

  const updateForm = (changes: Partial<MeetingInput>, invalidateResources = false) => {
    if (invalidateResources) clearResourceSelection();
    setForm((current) => ({ ...current, ...changes }));
  };

  useEffect(() => {
    void api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const participants = useMemo(
    () => selectedParticipants.filter((email) => email !== form.organizer_email.trim().toLowerCase()),
    [selectedParticipants, form.organizer_email],
  );

  useEffect(() => {
    const minimum = participants.length + 1;
    setForm((current) => current.expected_attendees < minimum
      ? { ...current, expected_attendees: minimum }
      : current);
  }, [participants.length]);

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
    clearResourceSelection();
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
    clearResourceSelection();
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
    clearResourceSelection();
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
        clearResourceSelection();
        setSelectedParticipants((current) => [...new Set([...current, ...participantInput.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean)])]);
        setParticipantInput("");
      }
      const expectedAttendees = Math.max(form.expected_attendees, currentParticipants.length + 1);
      if (expectedAttendees !== form.expected_attendees) {
        setForm((current) => ({ ...current, expected_attendees: expectedAttendees }));
      }
      const submissionForm = { ...form, expected_attendees: expectedAttendees };
      const validationError = validateForm(submissionForm, currentParticipants);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const created = await api.createMeeting({
        ...submissionForm,
        organizer_email: form.organizer_email.trim(),
        start_time: toIsoDateTime(form.start_time),
        end_time: toIsoDateTime(form.end_time),
        participant_emails: currentParticipants,
        expected_attendees: expectedAttendees,
        room_id: selectedRoom?.id ?? null,
        equipment_ids: selectedEquipment.map((item) => item.id),
      });
      setMessage(`Đã tạo ${created.length} lịch họp, ghi nhận ${currentParticipants.length} lời mời${selectedRoom ? `, đặt ${selectedRoom.name}` : ""}${selectedEquipment.length ? ` và ${selectedEquipment.length} thiết bị` : ""} thành công.`);
      setForm(initialForm);
      setParticipantInput("");
      setSelectedParticipants([]);
      setParticipantError("");
      clearResourceSelection();
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
        toIsoDateTime(form.start_time),
        toIsoDateTime(form.end_time),
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
    updateForm({ start_time: toIctuDateTimeInput(suggestion.start_time), end_time: toIctuDateTimeInput(suggestion.end_time) }, true);
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
    void api.availableRooms(
      toIsoDateTime(form.start_time),
      toIsoDateTime(form.end_time),
      Math.max(form.expected_attendees, currentParticipants.length + 1),
    )
      .then((rooms) => {
        setRoomOptions(rooms);
        setSelectedRoom(null);
        setMessage(rooms.length ? `Đã tìm thấy ${rooms.length} phòng phù hợp. Chọn một phòng rồi bấm Tạo lịch họp.` : "Không có phòng phù hợp trong khung giờ và quy mô này.");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Không thể tìm phòng phù hợp"))
      .finally(() => setRoomLoading(false));
  };

  const openEquipmentFinder = () => {
    const start = new Date(form.start_time);
    const end = new Date(form.end_time);
    if (!form.start_time || !form.end_time || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage("Hãy chọn thời gian hợp lệ trước khi tìm thiết bị.");
      return;
    }
    setEquipmentLoading(true);
    setMessage("");
    void api.availableEquipment(toIsoDateTime(form.start_time), toIsoDateTime(form.end_time))
      .then((items) => {
        setEquipmentOptions(items);
        setSelectedEquipment([]);
        setMessage(items.length ? `Đã tìm thấy ${items.length} thiết bị có thể đặt.` : "Không có thiết bị phù hợp trong khung giờ này.");
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Không thể tìm thiết bị"))
      .finally(() => setEquipmentLoading(false));
  };

  const toggleEquipment = (equipment: Equipment) => {
    setSelectedEquipment((current) => current.some((item) => item.id === equipment.id)
      ? current.filter((item) => item.id !== equipment.id)
      : [...current, equipment]);
  };

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">US01 · US03 · US04 · US05 · US12 · US16</span>
          <h2>Tạo lịch họp</h2>
        </div>
        <span className="badge">Sprint 2</span>
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
                clearResourceSelection();
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
                  <button type="button" aria-label={`Xóa ${email}`} onClick={() => { clearResourceSelection(); setSelectedParticipants((current) => current.filter((item) => item !== email)); }}>×</button>
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
        <label>Số người dự kiến
          <input
            aria-label="Số người dự kiến"
            required
            type="number"
            min={participants.length + 1}
            value={form.expected_attendees}
            onChange={(event) => updateForm({ expected_attendees: Number(event.target.value) }, true)}
          />
          <small className="field-hint">Tối thiểu {participants.length + 1} người, gồm người tổ chức.</small>
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
        <label>Nhắc lịch
          <select aria-label="Thời gian nhắc" value={form.reminder_minutes ?? ""} onChange={(event) => updateForm({ reminder_minutes: event.target.value ? Number(event.target.value) as 15 | 30 | 60 | 1440 : null })}>
            <option value="">Không nhắc</option>
            <option value="15">Trước 15 phút</option>
            <option value="30">Trước 30 phút</option>
            <option value="60">Trước 60 phút</option>
            <option value="1440">Trước 1 ngày</option>
          </select>
        </label>
        <div className="resource-summary">
          <span>Thiết bị đã chọn</span>
          <strong>{selectedEquipment.length} thiết bị</strong>
        </div>
        <div className="full action-row">
          <button className="button secondary" type="button" onClick={findSuggestions} disabled={loading}>Gợi ý giờ trống</button>
          <button className="button secondary" type="button" onClick={openRoomFinder} disabled={roomLoading}>{roomLoading ? "Đang tìm phòng..." : "Tìm phòng phù hợp"}</button>
          <button className="button secondary" type="button" onClick={openEquipmentFinder} disabled={equipmentLoading}>{equipmentLoading ? "Đang tìm thiết bị..." : "Tìm thiết bị"}</button>
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
      {equipmentOptions.length > 0 && (
        <div className="equipment-options" aria-label="Thiết bị phù hợp cho cuộc họp">
          <strong>Chọn nhiều thiết bị để đặt cùng lúc tạo lịch</strong>
          <div className="equipment-option-grid">
            {equipmentOptions.map((equipment) => {
              const selected = selectedEquipment.some((item) => item.id === equipment.id);
              return <button className={selected ? "selected" : ""} key={equipment.id} type="button" onClick={() => toggleEquipment(equipment)}>
                <strong>{equipment.code} · {equipment.name}{selected ? " · Đã chọn" : ""}</strong>
                <span>{equipment.category} · {equipment.location}</span>
              </button>;
            })}
          </div>
        </div>
      )}
      <p className="subtle">Quy mô dự kiến: {form.expected_attendees} người; tối thiểu {participants.length + 1} người theo danh sách hiện tại.</p>
      <datalist id="ictu-employees">{employees.map((employee) => <option key={employee.email} value={employee.email}>{employee.full_name} · {employee.department}</option>)}</datalist>
      {suggestions.length > 0 && (
        <div className="suggestions">
          <strong>Khung giờ đề xuất</strong>
          {suggestions.map((item) => (
            <button key={item.start_time} onClick={() => chooseSuggestion(item)}>
              {formatIctuDateTime(item.start_time)} - {formatIctuTime(item.end_time)}
            </button>
          ))}
        </div>
      )}
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
