import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Account, AccountRole, RoomPermission } from "../types";


const emptyUser = { full_name: "", email: "", department: "", role: "participant" as AccountRole };


export function UserManagement() {
  const [items, setItems] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<AccountRole | "">("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState(emptyUser);
  const [selected, setSelected] = useState<Account | null>(null);
  const [permissions, setPermissions] = useState<RoomPermission[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.adminUsers({ search, role, active, page, pageSize: 8 });
      setItems(result.items);
      setTotalPages(result.total_pages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải tài khoản");
    } finally {
      setLoading(false);
    }
  }, [active, page, role, search]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.createUser(form);
      setForm(emptyUser);
      setMessage("Đã tạo tài khoản. Mật khẩu tạm thời: ICTU123; người dùng phải đổi khi đăng nhập lần đầu.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo tài khoản");
    }
  };

  const update = async (account: Account, changes: Parameters<typeof api.updateUser>[1]) => {
    try {
      await api.updateUser(account.id, changes);
      setMessage("Đã cập nhật tài khoản và thu hồi các phiên không còn hợp lệ.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật tài khoản");
    }
  };

  const openPermissions = async (account: Account) => {
    setSelected(account);
    try {
      setPermissions(await api.roomPermissions(account.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải quyền phòng");
    }
  };

  const togglePermission = async (permission: RoomPermission) => {
    const canBook = !permission.can_book;
    const reason = canBook ? undefined : window.prompt("Lý do hạn chế phòng", permission.reason ?? "Theo phân công quản trị") ?? undefined;
    try {
      const updated = await api.updateRoomPermission(permission.account_id, permission.room_id, canBook, reason);
      setPermissions((current) => current.map((item) => item.room_id === updated.room_id ? updated : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật quyền phòng");
    }
  };

  return <div className="admin-users">
    <form className="admin-form compact-form" onSubmit={create}>
      <h3>Tạo tài khoản nhân viên</h3>
      <label>Họ tên<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
      <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Đơn vị<input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
      <label>Vai trò<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AccountRole })}><option value="participant">Người tham dự</option><option value="organizer">Người tổ chức</option><option value="admin">Quản trị viên</option></select></label>
      <button className="primary-action">Tạo tài khoản</button>
    </form>
    <div className="admin-user-directory">
      <div className="report-filters user-filters">
        <input aria-label="Tìm tài khoản" placeholder="Tên, email hoặc đơn vị" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <select aria-label="Lọc vai trò" value={role} onChange={(event) => { setRole(event.target.value as AccountRole | ""); setPage(1); }}><option value="">Mọi vai trò</option><option value="admin">Quản trị</option><option value="organizer">Tổ chức</option><option value="participant">Tham dự</option></select>
        <select aria-label="Lọc trạng thái tài khoản" value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }}><option value="">Mọi trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Đã khóa</option></select>
      </div>
      {message && <p className="notice" role="status">{message}</p>}
      {loading ? <p className="empty">Đang tải tài khoản...</p> : <div className="admin-list">
        {items.map((account) => <article className="admin-item user-item" key={account.id}>
          <div><strong>{account.full_name}</strong><span>{account.email} · {account.department}</span></div>
          <select aria-label={`Vai trò ${account.email}`} value={account.role} onChange={(event) => void update(account, { role: event.target.value as AccountRole })}><option value="admin">Quản trị</option><option value="organizer">Tổ chức</option><option value="participant">Tham dự</option></select>
          <b className={account.is_active ? "status-ok" : "status-danger"}>{account.is_active ? "Hoạt động" : "Đã khóa"}</b>
          <div className="item-actions">
            <button onClick={() => void openPermissions(account)}>Quyền phòng</button>
            <button onClick={() => void update(account, { reset_password: true })}>Đặt lại mật khẩu</button>
            <button className="danger" onClick={() => void update(account, { is_active: !account.is_active })}>{account.is_active ? "Khóa" : "Mở khóa"}</button>
          </div>
        </article>)}
      </div>}
      <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><span>Trang {page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button></div>
    </div>
    {selected && <section className="permission-panel">
      <div className="section-heading"><div><span className="eyebrow">US21</span><h3>Quyền đặt phòng · {selected.full_name}</h3></div><button onClick={() => setSelected(null)}>Đóng</button></div>
      <p className="subtle">Phòng bị hạn chế sẽ không xuất hiện trong kết quả tìm phòng và API cũng từ chối mọi yêu cầu đặt trực tiếp.</p>
      <div className="permission-grid">{permissions.map((permission) => <button className={permission.can_book ? "permission-allowed" : "permission-denied"} key={permission.room_id} onClick={() => void togglePermission(permission)}><strong>{permission.room_name}</strong><span>{permission.can_book ? "Được đặt" : `Không được đặt${permission.reason ? ` · ${permission.reason}` : ""}`}</span></button>)}</div>
    </section>}
  </div>;
}
