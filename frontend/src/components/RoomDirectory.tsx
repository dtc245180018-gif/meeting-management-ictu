import { FormEvent, useEffect, useState } from "react";
import type { Room } from "../types";
import { api } from "../services/api";

interface Props {
  meetingsCount: number;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

export function RoomDirectory({ meetingsCount }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[] | null>(null);
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

  return (
    <section className="card wide-card room-directory">
      <div className="section-heading">
        <div>
          <span className="eyebrow">US07 · US08 · Tài nguyên vật lý</span>
          <h2>Danh mục phòng họp ICTU</h2>
        </div>
        <span className="counter">{rooms.length} phòng đang hoạt động</span>
      </div>
      <p className="subtle">Chọn thời gian và sức chứa để xem phòng vật lý đang trống. Muốn đặt phòng, hãy mở cuộc họp tương ứng và chọn “Tìm phòng trống”.</p>
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
      <div className="room-catalog">
        {rooms.map((room) => <article className="room-card" key={room.id}><strong>{room.name}</strong><span>{room.capacity} chỗ ngồi</span><small>{room.location}</small></article>)}
      </div>
      <p className="subtle">Hiện có {meetingsCount} lịch họp trong hệ thống để kiểm thử đặt phòng và chống trùng lịch.</p>
    </section>
  );
}
