import { FormEvent, useEffect, useState } from "react";
import type { Meeting, Room } from "../types";
import { api } from "../services/api";

interface Props {
  meetings: Meeting[];
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

export function RoomDirectory({ meetings }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[] | null>(null);
  const [roomFilter, setRoomFilter] = useState<"" | "all" | "booked" | "free">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api.listRooms().then(setRooms).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Không thể tải danh sách phòng.");
    });
  }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!startTime || !endTime || new Date(endTime) <= new Date(startTime)) {
      setMessage("Hãy chọn khoảng thời gian hợp lệ, trong đó giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    try {
      setAvailableRooms(await api.availableRooms(toIso(startTime), toIso(endTime), Number(capacity)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tra cứu phòng trống.");
    }
  };

  const bookedRoomIds = new Set(
    meetings
      .filter((meeting) => meeting.booking?.status === "active")
      .map((meeting) => meeting.booking?.room_id)
      .filter((roomId): roomId is number => roomId !== undefined),
  );
  const filteredRooms = roomFilter === "booked"
    ? rooms.filter((room) => bookedRoomIds.has(room.id))
    : roomFilter === "free"
      ? rooms.filter((room) => !bookedRoomIds.has(room.id))
      : rooms;

  return (
    <section className="card wide-card room-directory">
      <div className="section-heading">
        <div>
          <span className="eyebrow">US07 · US08 · Tài nguyên vật lý</span>
          <h2>Danh mục phòng họp ICTU</h2>
        </div>
        <span className="counter">{rooms.length} phòng đang hoạt động</span>
      </div>
      <p className="subtle">Chọn bộ lọc để xem danh sách phòng. Muốn tra cứu chính xác theo khung giờ, hãy nhập thời gian và sức chứa bên dưới.</p>
      <div className="room-filter">
        <label>Danh sách phòng
          <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value as typeof roomFilter)}>
            <option value="">Chọn trạng thái phòng</option>
            <option value="all">Tất cả phòng</option>
            <option value="booked">Phòng đã có lịch</option>
            <option value="free">Phòng chưa có lịch</option>
          </select>
        </label>
        {roomFilter && <span>{filteredRooms.length} phòng thuộc bộ lọc đã chọn</span>}
      </div>
      <form className="room-search" onSubmit={search}>
        <label>Từ lúc<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>Đến lúc<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <label>Sức chứa tối thiểu<input required min="1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
        <button className="button primary" type="submit">Xem phòng đang trống</button>
      </form>
      {message && <p className="notice">{message}</p>}
      {availableRooms && (
        <div className="room-results">
          <strong>{availableRooms.length ? `Có ${availableRooms.length} phòng phù hợp` : "Không có phòng trống trong khung giờ này"}</strong>
          {availableRooms.map((room) => <div className="room-result" key={room.id}><strong>{room.name}</strong><span>{room.capacity} chỗ · {room.location}</span></div>)}
        </div>
      )}
      {roomFilter && (
        <div className="room-catalog">
          {filteredRooms.length === 0 && <p className="empty">Không có phòng thuộc trạng thái này.</p>}
          {filteredRooms.map((room) => {
            const isBooked = bookedRoomIds.has(room.id);
            return <article className={`room-card ${isBooked ? "booked" : "free"}`} key={room.id}>
              <strong>{room.name}</strong>
              <span>{room.capacity} chỗ ngồi</span>
              <small>{room.location}</small>
              <b>{isBooked ? "Đã có lịch" : "Chưa có lịch"}</b>
            </article>;
          })}
        </div>
      )}
      <p className="subtle">Hiện có {meetings.length} lịch họp trong hệ thống để kiểm thử đặt phòng và chống trùng lịch.</p>
    </section>
  );
}
