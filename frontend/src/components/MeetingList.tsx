import { useEffect, useState } from "react";
import type { Employee, Meeting, Room } from "../types";
import { api } from "../services/api";

interface Props {
  meetings: Meeting[];
  onChanged: () => void;
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function MeetingList({ meetings, onChanged }: Props) {
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState<Record<number, Room[]>>({});
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [details, setDetails] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editParticipantList, setEditParticipantList] = useState<string[]>([]);
  const [editParticipantInput, setEditParticipantInput] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editExpectedAttendees, setEditExpectedAttendees] = useState(1);

  useEffect(() => {
    if (!editing) return;
    setEditTitle(editing.title);
    setEditDescription(editing.description ?? "");
    setEditStart(toLocalInput(editing.start_time));
    setEditEnd(toLocalInput(editing.end_time));
    setEditParticipantList(editing.participants.map((participant) => participant.email));
    setEditParticipantInput("");
    setEditExpectedAttendees(editing.expected_attendees ?? editing.participants.length + 1);
  }, [editing]);

  useEffect(() => {
    void api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const addEditParticipant = (value: string) => {
    const emails = value.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    setEditParticipantList((current) => [...new Set([...current, ...emails])]);
    setEditParticipantInput("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.updateMeeting(editing.id, {
        requester_email: editing.organizer_email,
        title: editTitle,
        description: editDescription,
        start_time: new Date(editStart).toISOString(),
        end_time: new Date(editEnd).toISOString(),
        participant_emails: [...new Set([...editParticipantList, ...editParticipantInput.split(/[;,\n]/).map((value) => value.trim().toLowerCase()).filter(Boolean)])],
        expected_attendees: Math.max(editExpectedAttendees, editParticipantList.length + 1),
      });
      setMessage(`Đã cập nhật cuộc họp #${editing.id}.`);
      setEditing(null);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật cuộc họp");
    }
  };

  const cancel = async (meeting: Meeting) => {
    if (!window.confirm(`Bạn có chắc muốn hủy cuộc họp "${meeting.title}"?`)) return;
    try {
      await api.cancelMeeting(meeting.id, meeting.organizer_email);
      setMessage(`Đã hủy cuộc họp #${meeting.id}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể hủy cuộc họp");
    }
  };

  const findRooms = async (meeting: Meeting) => {
    try {
      const result = await api.availableRooms(meeting.start_time, meeting.end_time, Math.max(meeting.expected_attendees ?? 0, meeting.participants.length + 1));
      setRooms({ ...rooms, [meeting.id]: result });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tìm phòng");
    }
  };

  const book = async (meeting: Meeting, room: Room) => {
    try {
      await api.bookRoom(room.id, meeting.id, meeting.organizer_email);
      setMessage(`Đã đặt ${room.name} cho cuộc họp #${meeting.id}.`);
      setRooms({ ...rooms, [meeting.id]: [] });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đặt phòng");
    }
  };

  return (
    <section className="card wide-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">US02 · US06 · US07 · US08</span>
          <h2>Quản lý và đặt phòng</h2>
        </div>
        <span className="counter">{meetings.length} lịch</span>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="meeting-list">
        {meetings.length === 0 && <div className="empty">Chưa có lịch họp. Hãy tạo lịch đầu tiên.</div>}
        {meetings.map((meeting) => (
          <article className={`meeting-item ${meeting.status}`} key={meeting.id}>
            <div className="meeting-date">
              <strong>{new Date(meeting.start_time).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</strong>
              <span>{new Date(meeting.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="meeting-info">
              <div className="meeting-title-row">
                <h3>{meeting.title}</h3>
                <div className="meeting-controls">
                  <span className={`status ${meeting.status}`}>{meeting.status === "scheduled" ? "Đã lên lịch" : "Đã hủy"}</span>
                  {meeting.status === "scheduled" && <button className="more-button" onClick={() => setOpenMenu(openMenu === meeting.id ? null : meeting.id)} aria-label={`Thao tác cho ${meeting.title}`}>⋯</button>}
                  {openMenu === meeting.id && meeting.status === "scheduled" && (
                    <div className="more-menu">
                      {meeting.status === "scheduled" && <button onClick={() => { setEditing(meeting); setOpenMenu(null); }}>Chỉnh sửa</button>}
                      {meeting.status === "scheduled" && !meeting.booking && <button onClick={() => { findRooms(meeting); setOpenMenu(null); }}>Tìm phòng trống</button>}
                      {meeting.status === "scheduled" && <button className="menu-danger" onClick={() => { void cancel(meeting); setOpenMenu(null); }}>Hủy lịch</button>}
                    </div>
                  )}
                </div>
              </div>
              <p>{meeting.description || "Không có mô tả"}</p>
              <div className="meta">
                <span>Chủ trì: {meeting.organizer_email}</span>
                <span>{meeting.expected_attendees ?? meeting.participants.length + 1} người dự kiến · {meeting.participants.length} người tham dự</span>
                <span>{meeting.booking ? meeting.booking.room.name : "Chưa đặt phòng"}</span>
                {meeting.recurrence && <span>Lặp {meeting.recurrence === "weekly" ? "hằng tuần" : "hằng tháng"}</span>}
              </div>
              <div className="item-actions">
                <button onClick={() => setDetails(meeting)}>Xem chi tiết</button>
              </div>
              {meeting.participants.length > 0 && (
                <div className="participants">
                  <strong>Lời mời</strong>
                  {meeting.participants.map((participant) => (
                    <span key={participant.id} className={`participant ${participant.status}`}>
                      {participant.email} · {participant.status === "invited" ? "Đã mời" : participant.status === "accepted" ? "Đã xác nhận" : "Từ chối"}
                    </span>
                  ))}
                </div>
              )}
              {meeting.status === "scheduled" && (
                <div className="item-actions"><span className="action-hint">Mở ⋯ để thao tác</span></div>
              )}
              {editing?.id === meeting.id && (
                <div className="edit-form">
                  <label>Tên cuộc họp<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
                  <label>Mô tả<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
                  <div className="edit-grid">
                    <label>Bắt đầu<input type="datetime-local" value={editStart} onChange={(event) => setEditStart(event.target.value)} /></label>
                    <label>Kết thúc<input type="datetime-local" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} /></label>
                  </div>
                  <label>Số người dự kiến<input min={meeting.participants.length + 1} type="number" value={editExpectedAttendees} onChange={(event) => setEditExpectedAttendees(Number(event.target.value))} /></label>
                  <label>Người tham dự
                    <input value={editParticipantInput} onChange={(event) => { if (/[;,\n]/.test(event.target.value)) addEditParticipant(event.target.value); else setEditParticipantInput(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "," || event.key === ";") { event.preventDefault(); addEditParticipant(editParticipantInput); } }} onBlur={() => addEditParticipant(editParticipantInput)} placeholder="Gõ tên hoặc email rồi nhấn Enter" />
                    {editParticipantInput.trim() && <div className="employee-suggestions">{employees.filter((employee) => `${employee.full_name} ${employee.email} ${employee.department}`.toLowerCase().includes(editParticipantInput.trim().toLowerCase()) && !editParticipantList.includes(employee.email)).slice(0, 6).map((employee) => <button type="button" key={employee.email} onMouseDown={(event) => event.preventDefault()} onClick={() => addEditParticipant(employee.email)}><strong>{employee.full_name}</strong><span>{employee.email} · {employee.department}</span></button>)}</div>}
                    <div className="participant-chips">{editParticipantList.map((email) => <span className="participant-chip" key={email}>{email}<button type="button" aria-label={`Xóa ${email}`} onClick={() => setEditParticipantList((current) => current.filter((item) => item !== email))}>×</button></span>)}</div>
                  </label>
                  <div className="item-actions">
                    <button className="primary-action" onClick={saveEdit}>Lưu thay đổi</button>
                    <button onClick={() => setEditing(null)}>Đóng</button>
                  </div>
                </div>
              )}
              {rooms[meeting.id] && rooms[meeting.id].length > 0 && (
                <div className="room-options">
                  {rooms[meeting.id].map((room) => (
                    <button key={room.id} onClick={() => book(meeting, room)}>
                      <strong>{room.name}</strong>
                      <span>{room.capacity} chỗ · {room.location}</span>
                    </button>
                  ))}
                </div>
              )}
              {rooms[meeting.id] && rooms[meeting.id].length === 0 && !meeting.booking && (
                <p className="subtle">Không còn phòng phù hợp trong khung giờ này.</p>
              )}
            </div>
          </article>
        ))}
      </div>
      {details && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetails(null)}>
          <div className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="meeting-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div><span className="eyebrow">Chi tiết cuộc họp</span><h2 id="meeting-detail-title">{details.title}</h2></div>
              <button aria-label="Đóng chi tiết" onClick={() => setDetails(null)}>×</button>
            </div>
            <p>{details.description || "Không có mô tả"}</p>
            <div className="detail-grid">
              <span>Chủ trì: <strong>{details.organizer_email}</strong></span>
              <span>Bắt đầu: <strong>{new Date(details.start_time).toLocaleString("vi-VN")}</strong></span>
              <span>Kết thúc: <strong>{new Date(details.end_time).toLocaleString("vi-VN")}</strong></span>
              <span>Quy mô dự kiến: <strong>{details.expected_attendees ?? details.participants.length + 1} người</strong></span>
              <span>Phòng: <strong>{details.booking?.room.name ?? "Chưa đặt phòng"}</strong></span>
            </div>
            <div className="participants">
              <strong>Người tham dự ({details.participants.length})</strong>
              {details.participants.length === 0 && <span>Không có người tham dự.</span>}
              {details.participants.map((participant) => <span className={`participant ${participant.status}`} key={participant.id}>{participant.email} · {participant.status}</span>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
