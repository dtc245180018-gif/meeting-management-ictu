import { useEffect, useState } from "react";
import type { Employee, Meeting, Room } from "../types";
import { api } from "../services/api";
import { formatIctuDate, formatIctuDateTime, formatIctuTime, ictuInputToIso, toIctuDateTimeInput } from "../utils/dateTime";

interface Props {
  meetings: Meeting[];
  onChanged: () => void;
  currentUserEmail: string;
  focusMeetingId?: number | null;
  onFocusHandled?: () => void;
}

function toLocalInput(value: string) {
  return toIctuDateTimeInput(value);
}

export function MeetingList({ meetings, onChanged, currentUserEmail, focusMeetingId, onFocusHandled }: Props) {
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState<Record<number, Room[]>>({});
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [details, setDetails] = useState<Meeting | null>(null);
  const [busyMeeting, setBusyMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editParticipantList, setEditParticipantList] = useState<string[]>([]);
  const [editParticipantInput, setEditParticipantInput] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    if (!editing) return;
    setEditTitle(editing.title);
    setEditDescription(editing.description ?? "");
    setEditStart(toLocalInput(editing.start_time));
    setEditEnd(toLocalInput(editing.end_time));
    setEditParticipantList(editing.participants.map((participant) => participant.email));
    setEditParticipantInput("");
  }, [editing]);

  useEffect(() => {
    void api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!focusMeetingId) return;
    const target = meetings.find((meeting) => meeting.id === focusMeetingId);
    if (!target) return;
    setDetails(target);
    onFocusHandled?.();
  }, [focusMeetingId, meetings, onFocusHandled]);

  const addEditParticipant = (value: string) => {
    const emails = value.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    setEditParticipantList((current) => [...new Set([...current, ...emails])]);
    setEditParticipantInput("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editing.organizer_email !== currentUserEmail.toLowerCase()) {
      setMessage("Chỉ người tổ chức mới được chỉnh sửa cuộc họp.");
      return;
    }
    try {
      await api.updateMeeting(editing.id, {
        requester_email: currentUserEmail,
        title: editTitle,
        description: editDescription,
        start_time: ictuInputToIso(editStart),
        end_time: ictuInputToIso(editEnd),
        participant_emails: [...new Set([...editParticipantList, ...editParticipantInput.split(/[;,\n]/).map((value) => value.trim().toLowerCase()).filter(Boolean)])],
      });
      setMessage(`Đã cập nhật cuộc họp #${editing.id}.`);
      setEditing(null);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật cuộc họp");
    }
  };

  const cancel = async (meeting: Meeting) => {
    if (meeting.organizer_email !== currentUserEmail.toLowerCase()) {
      setMessage("Chỉ người tổ chức mới được hủy cuộc họp.");
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn hủy cuộc họp "${meeting.title}"?`)) return;
    try {
      await api.cancelMeeting(meeting.id, currentUserEmail);
      setMessage(`Đã hủy cuộc họp #${meeting.id}; phòng, thiết bị và nhắc lịch liên quan đã được giải phóng.`);
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
    if (meeting.organizer_email !== currentUserEmail.toLowerCase()) {
      setMessage("Chỉ người tổ chức mới được đặt phòng cho cuộc họp.");
      return;
    }
    try {
      await api.bookRoom(room.id, meeting.id, currentUserEmail);
      setMessage(`Đã đặt ${room.name} cho cuộc họp #${meeting.id}.`);
      setRooms({ ...rooms, [meeting.id]: [] });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đặt phòng");
    }
  };

  const syncGoogleCalendar = async (meeting: Meeting) => {
    try {
      const result = await api.syncGoogleCalendar(meeting.id, currentUserEmail);
      setMessage(result.sync_status === "deleted"
        ? `Đã xóa sự kiện #${meeting.id} khỏi Google Calendar và gửi cập nhật hủy.`
        : `Đã đồng bộ cuộc họp #${meeting.id} lên Google Calendar và gửi cập nhật tới khách mời.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đồng bộ Google Calendar");
    }
  };

  const respond = async (meeting: Meeting, response: "accepted" | "declined") => {
    try {
      await api.respondToInvitation(meeting.id, currentUserEmail, response);
      setMessage(response === "accepted" ? `Bạn đã chấp nhận lời mời #${meeting.id}.` : `Bạn đã từ chối lời mời #${meeting.id}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể phản hồi lời mời");
    }
  };

  const busyMailto = busyMeeting
    ? `mailto:${busyMeeting.organizer_email}?subject=${encodeURIComponent(`Báo bận: ${busyMeeting.title}`)}&body=${encodeURIComponent(
        `Kính gửi chủ cuộc họp,\n\nTôi là ${currentUserEmail} và đã chấp nhận tham dự cuộc họp "${busyMeeting.title}". Tuy nhiên, tôi vừa phát sinh lịch bận và muốn trao đổi lại về khả năng tham dự.\n\nTrân trọng.`,
      )}`
    : "";

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
              <strong>{formatIctuDate(meeting.start_time)}</strong>
              <span>{formatIctuTime(meeting.start_time)}</span>
            </div>
            <div className="meeting-info">
              <div className="meeting-title-row">
                <h3>{meeting.title}</h3>
                <div className="meeting-controls">
                  <span className={`status ${meeting.status}`}>{meeting.status === "scheduled" ? "Đã lên lịch" : "Đã hủy"}</span>
                  {meeting.status === "scheduled" && meeting.organizer_email === currentUserEmail.toLowerCase() && <button className="more-button" onClick={() => setOpenMenu(openMenu === meeting.id ? null : meeting.id)} aria-label={`Thao tác cho ${meeting.title}`}>⋯</button>}
                  {openMenu === meeting.id && meeting.status === "scheduled" && meeting.organizer_email === currentUserEmail.toLowerCase() && (
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
                <span>Tổng quy mô: {meeting.expected_attendees ?? meeting.participants.length + 1} người · {meeting.participants.length} người được mời</span>
                <span>{meeting.booking ? meeting.booking.room.name : "Chưa đặt phòng"}</span>
                <span>{meeting.equipment_bookings?.filter((item) => item.status === "active").length ?? 0} thiết bị</span>
                {meeting.recurrence && <span>Lặp {meeting.recurrence === "weekly" ? "hằng tuần" : "hằng tháng"}</span>}
              </div>
              <div className="item-actions">
                <button onClick={() => setDetails(meeting)}>Xem chi tiết</button>
                {meeting.organizer_email === currentUserEmail.toLowerCase() && <button onClick={() => void syncGoogleCalendar(meeting)}>{meeting.status === "cancelled" ? "Đồng bộ trạng thái hủy" : meeting.google_calendar_event?.sync_status === "synced" ? "Đồng bộ lại Google Calendar" : "Đồng bộ Google Calendar"}</button>}
                {meeting.google_calendar_event?.html_link && meeting.google_calendar_event.sync_status === "synced" && <a href={meeting.google_calendar_event.html_link} target="_blank" rel="noreferrer">Mở trên Google Calendar</a>}
                <a className="calendar-download" href={api.calendarFileUrl(meeting.id)} download={`meeting-${meeting.id}.ics`}>Tải lịch Outlook/ICS</a>
              </div>
              {meeting.google_calendar_event?.sync_status === "failed" && <p className="inline-error">Đồng bộ Google thất bại: {meeting.google_calendar_event.error_message}</p>}
              {meeting.participants.length > 0 && (
                <div className="participants">
                  <strong>Lời mời</strong>
                  {meeting.participants.map((participant) => (
                    <span key={participant.id} className={`participant ${participant.status}`}>
                      {participant.email} · {participant.status === "invited" ? "Đã mời" : participant.status === "accepted" ? "Đã xác nhận" : "Từ chối"}
                    </span>
                  ))}
                  {meeting.status === "scheduled" && (() => {
                    const currentParticipant = meeting.participants.find(
                      (participant) => participant.email === currentUserEmail.toLowerCase(),
                    );
                    if (!currentParticipant) return null;
                    if (currentParticipant.status === "accepted") {
                      return (
                        <div className="invitation-actions">
                          <button className="accept-invitation" type="button" disabled>Đã chấp nhận</button>
                          <button className="busy-invitation" type="button" onClick={() => setBusyMeeting(meeting)}>Báo bận</button>
                        </div>
                      );
                    }
                    if (currentParticipant.status === "declined") {
                      return (
                        <div className="invitation-actions">
                          <button className="accept-invitation" type="button" onClick={() => void respond(meeting, "accepted")}>Chấp nhận lại</button>
                        </div>
                      );
                    }
                    return (
                      <div className="invitation-actions">
                        <button className="accept-invitation" type="button" onClick={() => void respond(meeting, "accepted")}>Chấp nhận</button>
                        <button className="decline-invitation" type="button" onClick={() => void respond(meeting, "declined")}>Từ chối</button>
                      </div>
                    );
                  })()}
                </div>
              )}
              {meeting.status === "scheduled" && meeting.organizer_email === currentUserEmail.toLowerCase() && (
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
               <span>Bắt đầu: <strong>{formatIctuDateTime(details.start_time)}</strong></span>
               <span>Kết thúc: <strong>{formatIctuDateTime(details.end_time)}</strong></span>
              <span>Quy mô dự kiến: <strong>{details.expected_attendees ?? details.participants.length + 1} người</strong></span>
              <span>Phòng: <strong>{details.booking?.room.name ?? "Chưa đặt phòng"}</strong></span>
            </div>
            <div className="participants">
              <strong>Thiết bị ({details.equipment_bookings?.filter((item) => item.status === "active").length ?? 0})</strong>
              {!details.equipment_bookings?.some((item) => item.status === "active") && <span>Không đặt kèm thiết bị.</span>}
              {details.equipment_bookings?.filter((item) => item.status === "active").map((item) => <span className="participant" key={item.id}>{item.equipment.code} · {item.equipment.name}</span>)}
            </div>
            <div className="participants">
              <strong>Người tham dự ({details.participants.length})</strong>
              {details.participants.length === 0 && <span>Không có người tham dự.</span>}
              {details.participants.map((participant) => <span className={`participant ${participant.status}`} key={participant.id}>{participant.email} · {participant.status}</span>)}
            </div>
          </div>
        </div>
      )}
      {busyMeeting && (
        <div className="modal-backdrop" role="presentation" onClick={() => setBusyMeeting(null)}>
          <div className="detail-modal busy-modal" role="dialog" aria-modal="true" aria-labelledby="busy-meeting-title" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div><span className="eyebrow">Thông báo lịch bận</span><h2 id="busy-meeting-title">Liên hệ chủ cuộc họp</h2></div>
              <button aria-label="Đóng thông báo bận" onClick={() => setBusyMeeting(null)}>×</button>
            </div>
            <p>Bạn đã chấp nhận tham dự cuộc họp <strong>{busyMeeting.title}</strong>.</p>
            <div className="busy-contact-card">
              <span>Chủ cuộc họp</span>
              <strong>{busyMeeting.organizer_email}</strong>
            </div>
            <p>Nếu phát sinh lịch bận, bạn phải liên hệ trực tiếp với chủ cuộc họp qua email công ty để trao đổi. Trạng thái tham dự hiện vẫn được giữ là <strong>Đã xác nhận</strong>.</p>
            <div className="item-actions">
              <a className="busy-email-link" href={busyMailto}>Soạn email cho chủ cuộc họp</a>
              <button type="button" onClick={() => setBusyMeeting(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
