import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Equipment, EquipmentAdminInput, Room, RoomAdminInput } from "../types";


interface Props {
  adminEmail: string;
}

const emptyRoom = {
  name: "", capacity: 1, location: "", building: "", floor: 1, room_type: "Phòng họp",
  projector: false, display: false, microphone: false, video_conferencing: false,
};
const emptyEquipment = { code: "", name: "", category: "projector", location: "", status: "available" as const };


export function AdminPanel({ adminEmail }: Props) {
  const [tab, setTab] = useState<"rooms" | "equipment">("rooms");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentAdminInput>(emptyEquipment as EquipmentAdminInput);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editingEquipmentId, setEditingEquipmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (preserveMessage = false) => {
    setLoading(true);
    if (!preserveMessage) setMessage("");
    try {
      const [roomItems, equipmentItems] = await Promise.all([
        api.adminRooms(adminEmail), api.adminEquipment(adminEmail),
      ]);
      setRooms(roomItems);
      setEquipment(equipmentItems);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { void load(); }, [load]);

  const saveRoom = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const payload: RoomAdminInput = { ...roomForm, requester_email: adminEmail };
      if (editingRoomId) await api.updateRoom(editingRoomId, payload);
      else await api.createRoom(payload);
      setMessage(editingRoomId ? "Đã cập nhật phòng." : "Đã thêm phòng mới.");
      setEditingRoomId(null);
      setRoomForm(emptyRoom);
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu phòng.");
    }
  };

  const editRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setRoomForm({
      name: room.name, capacity: room.capacity, location: room.location, building: room.building ?? "",
      floor: room.floor ?? 1, room_type: room.room_type ?? "Phòng họp", projector: Boolean(room.projector),
      display: Boolean(room.display), microphone: Boolean(room.microphone), video_conferencing: Boolean(room.video_conferencing),
    });
  };

  const toggleRoom = async (room: Room) => {
    try {
      if (room.is_active === false) await api.updateRoom(room.id, { requester_email: adminEmail, is_active: true });
      else await api.deactivateRoom(room.id, adminEmail);
      setMessage(room.is_active === false ? "Đã kích hoạt lại phòng." : "Đã ngừng sử dụng phòng; lịch sử đặt phòng được giữ nguyên.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi trạng thái phòng.");
    }
  };

  const saveEquipment = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const payload: EquipmentAdminInput = { ...equipmentForm, requester_email: adminEmail };
      if (editingEquipmentId) await api.updateEquipment(editingEquipmentId, payload);
      else await api.createEquipment(payload);
      setMessage(editingEquipmentId ? "Đã cập nhật thiết bị." : "Đã thêm thiết bị mới.");
      setEditingEquipmentId(null);
      setEquipmentForm({ ...emptyEquipment, requester_email: adminEmail });
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu thiết bị.");
    }
  };

  const editEquipment = (item: Equipment) => {
    setEditingEquipmentId(item.id);
    setEquipmentForm({
      requester_email: adminEmail, code: item.code, name: item.name, category: item.category,
      location: item.location, status: item.status === "booked" ? "available" : item.status,
    });
  };

  const deactivateEquipment = async (item: Equipment) => {
    try {
      if (item.status === "inactive") await api.updateEquipment(item.id, { requester_email: adminEmail, status: "available", is_active: true });
      else await api.deactivateEquipment(item.id, adminEmail);
      setMessage(item.status === "inactive" ? "Đã kích hoạt lại thiết bị." : "Đã khóa thiết bị; lịch sử đặt được giữ nguyên.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi trạng thái thiết bị.");
    }
  };

  return <section className="card wide-card admin-panel">
    <div className="section-heading">
      <div><span className="eyebrow">US11 · US14 · Quản trị tạm thời</span><h2>Quản trị tài nguyên</h2></div>
      <span className="badge">{adminEmail}</span>
    </div>
    <p className="notice">Sprint 2 kiểm tra quản trị viên bằng ADMIN_EMAILS. Xác thực và phân quyền đầy đủ thuộc Sprint 3.</p>
    <div className="admin-tabs">
      <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>Quản lý phòng</button>
      <button className={tab === "equipment" ? "active" : ""} onClick={() => setTab("equipment")}>Quản lý thiết bị</button>
    </div>
    {message && <p className="notice" role="status">{message}</p>}
    {loading && <p className="empty">Đang tải dữ liệu quản trị...</p>}
    {!loading && tab === "rooms" && <div className="admin-layout">
      <form className="admin-form" onSubmit={saveRoom}>
        <h3>{editingRoomId ? "Sửa phòng" : "Thêm phòng"}</h3>
        <label>Tên phòng<input required aria-label="Tên phòng quản trị" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} /></label>
        <label>Sức chứa<input required aria-label="Sức chứa quản trị" type="number" min="1" value={roomForm.capacity} onChange={(event) => setRoomForm({ ...roomForm, capacity: Number(event.target.value) })} /></label>
        <label>Vị trí<input required value={roomForm.location} onChange={(event) => setRoomForm({ ...roomForm, location: event.target.value })} /></label>
        <div className="edit-grid"><label>Khu nhà<input value={roomForm.building} onChange={(event) => setRoomForm({ ...roomForm, building: event.target.value })} /></label><label>Tầng<input type="number" min="0" value={roomForm.floor} onChange={(event) => setRoomForm({ ...roomForm, floor: Number(event.target.value) })} /></label></div>
        <label>Loại phòng<input value={roomForm.room_type} onChange={(event) => setRoomForm({ ...roomForm, room_type: event.target.value })} /></label>
        <div className="check-grid">{(["projector", "display", "microphone", "video_conferencing"] as const).map((key) => <label key={key}><input type="checkbox" checked={roomForm[key]} onChange={(event) => setRoomForm({ ...roomForm, [key]: event.target.checked })} />{key}</label>)}</div>
        <div className="item-actions"><button className="primary-action" type="submit">{editingRoomId ? "Lưu phòng" : "Thêm phòng"}</button>{editingRoomId && <button type="button" onClick={() => { setEditingRoomId(null); setRoomForm(emptyRoom); }}>Hủy sửa</button>}</div>
      </form>
      <div className="admin-list">{rooms.map((room) => <article className="admin-item" key={room.id}><div><strong>{room.name}</strong><span>{room.capacity} chỗ · {room.location}</span></div><b>{room.is_active === false ? "Ngừng sử dụng" : "Đang hoạt động"}</b><div className="item-actions"><button onClick={() => editRoom(room)}>Sửa</button><button className="danger" onClick={() => void toggleRoom(room)}>{room.is_active === false ? "Kích hoạt" : "Khóa phòng"}</button></div></article>)}</div>
    </div>}
    {!loading && tab === "equipment" && <div className="admin-layout">
      <form className="admin-form" onSubmit={saveEquipment}>
        <h3>{editingEquipmentId ? "Sửa thiết bị" : "Thêm thiết bị"}</h3>
        <label>Mã thiết bị<input required aria-label="Mã thiết bị quản trị" value={equipmentForm.code} onChange={(event) => setEquipmentForm({ ...equipmentForm, code: event.target.value })} /></label>
        <label>Tên thiết bị<input required aria-label="Tên thiết bị quản trị" value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} /></label>
        <label>Loại<input required value={equipmentForm.category} onChange={(event) => setEquipmentForm({ ...equipmentForm, category: event.target.value })} /></label>
        <label>Vị trí<input required value={equipmentForm.location} onChange={(event) => setEquipmentForm({ ...equipmentForm, location: event.target.value })} /></label>
        <label>Trạng thái<select aria-label="Trạng thái quản trị thiết bị" value={equipmentForm.status} onChange={(event) => setEquipmentForm({ ...equipmentForm, status: event.target.value as EquipmentAdminInput["status"] })}><option value="available">Sẵn sàng</option><option value="maintenance">Bảo trì</option><option value="inactive">Ngừng sử dụng</option></select></label>
        <div className="item-actions"><button className="primary-action" type="submit">{editingEquipmentId ? "Lưu thiết bị" : "Thêm thiết bị"}</button>{editingEquipmentId && <button type="button" onClick={() => { setEditingEquipmentId(null); setEquipmentForm({ ...emptyEquipment, requester_email: adminEmail }); }}>Hủy sửa</button>}</div>
      </form>
      <div className="admin-list">{equipment.map((item) => <article className="admin-item" key={item.id}><div><strong>{item.code} · {item.name}</strong><span>{item.category} · {item.location}</span></div><b>{item.status}</b><div className="item-actions"><button onClick={() => editEquipment(item)}>Sửa</button><button className="danger" onClick={() => void deactivateEquipment(item)}>{item.status === "inactive" ? "Kích hoạt" : "Khóa"}</button></div></article>)}</div>
    </div>}
  </section>;
}
