import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { Equipment, EquipmentAdminInput, EquipmentBulkAdminInput, Room, RoomAdminInput } from "../types";
import { UserManagement } from "./UserManagement";
import { ReportsPanel } from "./ReportsPanel";
import { HrmSyncPanel } from "./HrmSyncPanel";


interface Props {
  adminEmail: string;
}

const emptyRoom = {
  name: "", capacity: 1, location: "", building: "", floor: 1, room_type: "Phòng họp",
  projector: false, display: false, microphone: false, video_conferencing: false,
};
const emptyEquipment = { code: "", name: "", category: "projector", location: "", status: "available" as const };
const emptyEquipmentBatch = {
  code_prefix: "TB-TV", start_number: 1, quantity: 1, name: "TV", category: "display",
  location: "Kho thiết bị", status: "available" as const,
};

const categoryLabels: Record<string, string> = {
  display: "Màn hình / TV",
  projector: "Máy chiếu",
  microphone: "Âm thanh / Micro",
  video_conferencing: "Họp trực tuyến",
  video_conference: "Họp trực tuyến",
  whiteboard: "Bảng viết",
  computer: "Máy tính",
  other: "Thiết bị khác",
};

const statusLabels: Record<Equipment["status"], string> = {
  available: "Sẵn sàng",
  booked: "Đã được đặt",
  maintenance: "Bảo trì",
  inactive: "Ngừng sử dụng",
};


export function AdminPanel({ adminEmail }: Props) {
  const [tab, setTab] = useState<"users" | "rooms" | "equipment" | "reports" | "hrm">("rooms");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentAdminInput>(emptyEquipment as EquipmentAdminInput);
  const [equipmentBatch, setEquipmentBatch] = useState<EquipmentBulkAdminInput>(emptyEquipmentBatch as EquipmentBulkAdminInput);
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
      if (editingEquipmentId) {
        const payload: EquipmentAdminInput = { ...equipmentForm, requester_email: adminEmail };
        await api.updateEquipment(editingEquipmentId, payload);
        setMessage("Đã cập nhật thiết bị.");
      } else {
        const result = await api.createEquipmentBulk({ ...equipmentBatch, requester_email: adminEmail });
        setMessage(`Đã thêm ${result.created_count} thiết bị và tạo mã riêng cho từng tài sản.`);
        setEquipmentBatch({ ...emptyEquipmentBatch, requester_email: adminEmail });
      }
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

  const equipmentGroups = useMemo(() => {
    const groups = new Map<string, {
      category: string; name: string; total: number; available: number; booked: number; maintenance: number; inactive: number;
    }>();
    for (const item of equipment) {
      const key = `${item.category.toLowerCase()}::${item.name.toLowerCase()}`;
      const group = groups.get(key) ?? {
        category: item.category, name: item.name, total: 0, available: 0, booked: 0, maintenance: 0, inactive: 0,
      };
      group.total += 1;
      group[item.status] += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`, "vi"));
  }, [equipment]);

  return <section className="card wide-card admin-panel">
    <div className="section-heading">
      <div><span className="eyebrow">US18–US24 · US28</span><h2>Quản trị hệ thống</h2></div>
      <span className="badge">{adminEmail}</span>
    </div>
    <p className="notice">Mọi thao tác quản trị được kiểm tra bằng vai trò từ phiên đăng nhập và được ghi nhật ký.</p>
    <div className="admin-tabs">
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Tài khoản & phân quyền</button>
      <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>Quản lý phòng</button>
      <button className={tab === "equipment" ? "active" : ""} onClick={() => setTab("equipment")}>Quản lý thiết bị</button>
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Báo cáo & xuất file</button>
      <button className={tab === "hrm" ? "active" : ""} onClick={() => setTab("hrm")}>Đồng bộ HRM/ERP</button>
    </div>
    {message && <p className="notice" role="status">{message}</p>}
    {loading && (tab === "rooms" || tab === "equipment") && <p className="empty">Đang tải dữ liệu quản trị...</p>}
    {tab === "users" && <UserManagement />}
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
        <h3>{editingEquipmentId ? "Sửa từng thiết bị" : "Nhập kho thiết bị"}</h3>
        {editingEquipmentId ? <>
          <label>Mã tài sản<input required aria-label="Mã thiết bị quản trị" value={equipmentForm.code} onChange={(event) => setEquipmentForm({ ...equipmentForm, code: event.target.value })} /></label>
          <label>Tên thiết bị<input required aria-label="Tên thiết bị quản trị" value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} /></label>
          <label>Loại<select aria-label="Loại thiết bị quản trị" value={equipmentForm.category} onChange={(event) => setEquipmentForm({ ...equipmentForm, category: event.target.value })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Vị trí<input required aria-label="Vị trí thiết bị quản trị" value={equipmentForm.location} onChange={(event) => setEquipmentForm({ ...equipmentForm, location: event.target.value })} /></label>
          <label>Trạng thái<select aria-label="Trạng thái quản trị thiết bị" value={equipmentForm.status} onChange={(event) => setEquipmentForm({ ...equipmentForm, status: event.target.value as EquipmentAdminInput["status"] })}><option value="available">Sẵn sàng</option><option value="maintenance">Bảo trì</option><option value="inactive">Ngừng sử dụng</option></select></label>
        </> : <>
          <label>Tiền tố mã tài sản<input required aria-label="Tiền tố mã thiết bị" value={equipmentBatch.code_prefix} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, code_prefix: event.target.value })} placeholder="Ví dụ: TB-TV" /></label>
          <div className="edit-grid"><label>Số bắt đầu<input required aria-label="Số bắt đầu mã thiết bị" type="number" min="1" max="99999" value={equipmentBatch.start_number} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, start_number: Number(event.target.value) })} /></label><label>Số lượng<input required aria-label="Số lượng thiết bị" type="number" min="1" max="100" value={equipmentBatch.quantity} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, quantity: Number(event.target.value) })} /></label></div>
          <small className="field-hint">Ví dụ TB-TV, bắt đầu 1, số lượng 10 sẽ tạo TB-TV-01 đến TB-TV-10.</small>
          <label>Tên thiết bị<input required aria-label="Tên thiết bị quản trị" value={equipmentBatch.name} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, name: event.target.value })} /></label>
          <label>Loại<select aria-label="Loại thiết bị quản trị" value={equipmentBatch.category} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, category: event.target.value })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Vị trí kho<input required aria-label="Vị trí thiết bị quản trị" value={equipmentBatch.location} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, location: event.target.value })} /></label>
          <label>Trạng thái ban đầu<select aria-label="Trạng thái quản trị thiết bị" value={equipmentBatch.status} onChange={(event) => setEquipmentBatch({ ...equipmentBatch, status: event.target.value as EquipmentBulkAdminInput["status"] })}><option value="available">Sẵn sàng</option><option value="maintenance">Bảo trì</option><option value="inactive">Ngừng sử dụng</option></select></label>
        </>}
        <div className="item-actions"><button className="primary-action" type="submit">{editingEquipmentId ? "Lưu thiết bị" : "Nhập kho"}</button>{editingEquipmentId && <button type="button" onClick={() => { setEditingEquipmentId(null); setEquipmentForm({ ...emptyEquipment, requester_email: adminEmail }); }}>Hủy sửa</button>}</div>
      </form>
      <div className="inventory-directory">
        <section className="inventory-summary" aria-label="Tổng hợp kho thiết bị">
          <h3>Tồn kho theo loại</h3>
          <div className="inventory-group-grid">{equipmentGroups.map((group) => <article key={`${group.category}-${group.name}`}><strong>{categoryLabels[group.category] ?? group.category} · {group.name}</strong><span>Tổng {group.total} · Sẵn sàng {group.available} · Đã đặt {group.booked}</span><small>Bảo trì {group.maintenance} · Ngừng dùng {group.inactive}</small></article>)}</div>
        </section>
        <h3>Danh sách từng tài sản</h3>
        <div className="admin-list">{equipment.map((item) => <article className="admin-item" key={item.id}><div><strong>{item.code} · {item.name}</strong><span>{categoryLabels[item.category] ?? item.category} · {item.location}</span></div><b>{statusLabels[item.status]}</b><div className="item-actions"><button onClick={() => editEquipment(item)}>Sửa</button><button className="danger" onClick={() => void deactivateEquipment(item)}>{item.status === "inactive" ? "Kích hoạt" : "Khóa"}</button></div></article>)}</div>
      </div>
    </div>}
    {tab === "reports" && <ReportsPanel />}
    {tab === "hrm" && <HrmSyncPanel />}
  </section>;
}
