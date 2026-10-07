import { FormEvent, useEffect, useState } from "react";
import type { Meeting, Room } from "../types";
import { api } from "../services/api";
import { filterRooms, getBookedRoomIds } from "../utils/meetingFilters";
import { ictuInputToIso } from "../utils/dateTime";

interface Props {
  meetings: Meeting[];
  initialSearch?: { startTime: string; endTime: string; minCapacity: number } | null;
}

function toIso(value: string) {
  return ictuInputToIso(value);
}

export function RoomDirectory({ meetings, initialSearch }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[] | null>(null);
  const [roomFilter, setRoomFilter] = useState<"all" | "booked" | "free">("all");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [roomType, setRoomType] = useState("");
  const [equipment, setEquipment] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState(String(initialSearch?.minCapacity ?? 1));
  const [message, setMessage] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    if (!initialSearch) return;
    setStartTime(initialSearch.startTime);
    setEndTime(initialSearch.endTime);
    setCapacity(String(initialSearch.minCapacity));
    setAvailableRooms(null);
    setShowCatalog(true);
  }, [initialSearch]);

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
      setShowCatalog(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tra cứu phòng trống.");
    }
  };

  const hasSearchWindow = Boolean(startTime && endTime && new Date(endTime) > new Date(startTime));
  const availableRoomIds = new Set((availableRooms ?? []).map((room) => room.id));
  const catalogRooms = availableRooms
    ? rooms.filter((room) => room.capacity >= Number(capacity || 1))
    : rooms;
  const bookedRoomIds = availableRooms
    ? new Set(catalogRooms.filter((room) => !availableRoomIds.has(room.id)).map((room) => room.id))
    : getBookedRoomIds(meetings);
  const criteriaRooms = catalogRooms.filter((room) => {
    const matchesEquipment = !equipment
      || (equipment === "projector" && room.projector)
      || (equipment === "display" && room.display)
      || (equipment === "microphone" && room.microphone)
      || (equipment === "video_conferencing" && room.video_conferencing);
    return (!building || room.building === building)
      && (!floor || String(room.floor) === floor)
      && (!roomType || room.room_type === roomType)
      && matchesEquipment;
  });
  // The basic booked/free catalog filter works from the active bookings already
  // loaded. A time-window search narrows that same list to exact availability.
  const filteredRooms = filterRooms(criteriaRooms, bookedRoomIds, roomFilter);
  const buildings = [...new Set(rooms.map((room) => room.building).filter(Boolean))];
  const roomTypes = [...new Set(rooms.map((room) => room.room_type).filter((item): item is string => Boolean(item)))];
  const floors = [...new Set(rooms.map((room) => room.floor).filter((item): item is number => item !== undefined))].sort((a, b) => a - b);
  const hasCatalogCriteria = Boolean(building || floor || roomType || equipment || roomFilter !== "all");
  const shouldShowCatalog = showCatalog || hasCatalogCriteria || Boolean(availableRooms);

  const resetFilters = () => {
    setBuilding("");
    setFloor("");
    setRoomType("");
    setEquipment("");
    setRoomFilter("all");
    setStartTime("");
    setEndTime("");
    setCapacity("1");
    setAvailableRooms(null);
    setMessage("");
    setShowCatalog(false);
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
      <p className="subtle">Chọn bộ lọc để xem danh sách phòng. Muốn tra cứu chính xác theo khung giờ, hãy nhập thời gian và sức chứa bên dưới.</p>
      <div className="room-filter">
        <label>Danh sách phòng
          <select value={roomFilter} onChange={(event) => { setRoomFilter(event.target.value as typeof roomFilter); setShowCatalog(true); }}>
            <option value="all">Tất cả phòng</option>
            <option value="free">{availableRooms ? "Trống trong khung giờ" : "Chưa có lịch đặt"}</option>
            <option value="booked">{availableRooms ? "Đã đặt trong khung giờ" : "Có lịch đặt"}</option>
          </select>
        </label>
        <span>{availableRooms ? "Trạng thái được tính theo đúng khung giờ đã chọn" : `${filteredRooms.length} phòng thuộc bộ lọc đã chọn`}</span>
        <div className="room-filter-actions">
          <button className="button secondary" type="button" onClick={() => setShowCatalog((visible) => !visible)}>{showCatalog ? "Ẩn danh sách phòng" : "Xem danh sách phòng"}</button>
          <button className="button secondary" type="button" onClick={resetFilters}>Xóa bộ lọc</button>
        </div>
      </div>
      <div className="room-filter room-criteria">
        <label>Tòa nhà/khu vực
          <select value={building} onChange={(event) => { setBuilding(event.target.value); setShowCatalog(true); }}><option value="">Tất cả</option>{buildings.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </label>
        <label>Tầng
          <select value={floor} onChange={(event) => { setFloor(event.target.value); setShowCatalog(true); }}><option value="">Tất cả</option>{floors.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </label>
        <label>Loại phòng
          <select value={roomType} onChange={(event) => { setRoomType(event.target.value); setShowCatalog(true); }}><option value="">Tất cả</option>{roomTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </label>
        <label>Thiết bị
          <select value={equipment} onChange={(event) => { setEquipment(event.target.value); setShowCatalog(true); }}><option value="">Tất cả</option><option value="projector">Máy chiếu</option><option value="display">Màn hình</option><option value="microphone">Micro</option><option value="video_conferencing">Họp trực tuyến</option></select>
        </label>
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
          {availableRooms.map((room) => <div className="room-result" key={room.id}><strong>{room.name}</strong><span>{room.capacity} chỗ · {room.location} · {room.room_type}</span></div>)}
        </div>
      )}
      {shouldShowCatalog ? <div className="room-catalog">
        {filteredRooms.length === 0 && <p className="empty">Không có phòng thuộc trạng thái này.</p>}
        {filteredRooms.map((room) => {
          const isBooked = bookedRoomIds.has(room.id);
          const restricted = room.can_book === false;
          return <article className={`room-card ${restricted ? "restricted" : isBooked ? "booked" : "free"}`} key={room.id}>
            <strong>{room.name}</strong>
            <span>{room.capacity} chỗ ngồi</span>
            <small>{room.location}</small>
            <small>Tòa nhà {room.building || "Chưa khai báo"} · Tầng {room.floor ?? "-"} · {room.room_type || "Phòng họp"}</small>
            <small>Thiết bị: {[room.projector && "máy chiếu", room.display && "màn hình", room.microphone && "micro", room.video_conferencing && "họp trực tuyến"].filter(Boolean).join(", ") || "Chưa khai báo"}</small>
            <b>{restricted ? `Bạn không được đặt phòng này${room.restriction_reason ? ` · ${room.restriction_reason}` : ""}` : hasSearchWindow && availableRooms ? (isBooked ? "Đã có lịch trong khung giờ" : "Trống trong khung giờ") : (isBooked ? "Có lịch đặt" : "Chưa có lịch đặt")}</b>
          </article>;
        })}
      </div> : <p className="empty room-directory-empty">Danh sách phòng đang được ẩn. Hãy chọn bộ lọc hoặc bấm “Xem danh sách phòng”.</p>}
      <p className="subtle">Hiện có {meetings.length} lịch họp trong hệ thống để kiểm thử đặt phòng và chống trùng lịch.</p>
    </section>
  );
}
