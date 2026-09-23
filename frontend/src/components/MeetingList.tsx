import { useState } from "react";
import type { Meeting, Room } from "../types";
import { api } from "../services/api";

interface Props {
  meetings: Meeting[];
  onChanged: () => void;
}

export function MeetingList({ meetings, onChanged }: Props) {
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState<Record<number, Room[]>>({});

  const cancel = async (meeting: Meeting) => {
    try {
      await api.cancelMeeting(meeting.id, meeting.organizer_email);
      setMessage(`Đã hủy cuộc họp #${meeting.id}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể hủy cuộc họp");
    }
  };

  const rename = async (meeting: Meeting) => {
    const title = window.prompt("Tên cuộc họp mới", meeting.title);
    if (!title || title === meeting.title) return;
    try {
      await api.updateMeeting(meeting.id, { requester_email: meeting.organizer_email, title });
      setMessage(`Đã cập nhật cuộc họp #${meeting.id}.`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật cuộc họp");
    }
  };

  const findRooms = async (meeting: Meeting) => {
    try {
      const result = await api.availableRooms(meeting.start_time, meeting.end_time, meeting.participants.length + 1);
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
                <span className={`status ${meeting.status}`}>{meeting.status === "scheduled" ? "Đã lên lịch" : "Đã hủy"}</span>
              </div>
              <p>{meeting.description || "Không có mô tả"}</p>
              <div className="meta">
                <span>Chủ trì: {meeting.organizer_email}</span>
                <span>{meeting.participants.length} người tham dự</span>
                <span>{meeting.booking ? meeting.booking.room.name : "Chưa đặt phòng"}</span>
                {meeting.recurrence && <span>Lặp {meeting.recurrence === "weekly" ? "hằng tuần" : "hằng tháng"}</span>}
              </div>
              {meeting.status === "scheduled" && (
                <div className="item-actions">
                  <button onClick={() => rename(meeting)}>Đổi tên</button>
                  {!meeting.booking && <button onClick={() => findRooms(meeting)}>Tìm phòng trống</button>}
                  <button className="danger" onClick={() => cancel(meeting)}>Hủy lịch</button>
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
    </section>
  );
}

