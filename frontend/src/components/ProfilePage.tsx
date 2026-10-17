import { useEffect, useState, type FormEvent } from "react";
import { api } from "../services/api";
import type { Account } from "../types";
import { GoogleCalendarPanel } from "./GoogleCalendarPanel";


interface Props {
  account: Account;
  onUpdated: (account: Account) => void;
  onLogout: () => Promise<void>;
}


const roleLabels: Record<Account["role"], string> = {
  admin: "Quản trị viên",
  organizer: "Người tổ chức",
  participant: "Người tham dự",
};


function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1]?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "ICTU").toUpperCase();
}


export function ProfilePage({ account, onUpdated, onLogout }: Props) {
  const [fullName, setFullName] = useState(account.full_name);
  const [department, setDepartment] = useState(account.department);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setFullName(account.full_name);
    setDepartment(account.department);
  }, [account.department, account.full_name]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updated = await api.updateProfile({ full_name: fullName.trim(), department: department.trim() });
      onUpdated(updated);
      setMessage("Đã lưu thông tin cá nhân.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setMessage("Đổi mật khẩu thành công. Hệ thống sẽ đăng xuất để bảo vệ tài khoản.");
      window.setTimeout(() => { void onLogout(); }, 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đổi mật khẩu.");
    } finally {
      setChangingPassword(false);
    }
  };

  return <div className="profile-page">
    <header className="profile-page-heading">
      <div><span>Tài khoản ICTU</span><h1>Cài đặt cá nhân</h1><p>Quản lý thông tin, bảo mật và các kết nối của bạn.</p></div>
    </header>

    {(message || error) && <p className={error ? "profile-feedback error" : "profile-feedback success"} role="status">{error || message}</p>}

    <section className="card profile-card" aria-labelledby="profile-information-title">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">{initials(account.full_name)}</span>
        <div><h2 id="profile-information-title">{account.full_name}</h2><span>{roleLabels[account.role]} · {account.department}</span></div>
      </div>
      <form className="profile-form" onSubmit={saveProfile}>
        <label>Họ và tên
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={160} required />
        </label>
        <label>Đơn vị / phòng ban
          <input value={department} onChange={(event) => setDepartment(event.target.value)} minLength={2} maxLength={160} required />
        </label>
        <label>Email đăng nhập
          <input value={account.email} readOnly aria-readonly="true" />
          <small>Email được quản trị viên hoặc HRM quản lý để bảo đảm liên kết lịch họp.</small>
        </label>
        <label>Quyền hệ thống
          <input value={roleLabels[account.role]} readOnly aria-readonly="true" />
        </label>
        <button className="dashboard-button primary" type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
      </form>
    </section>

    <GoogleCalendarPanel email={account.email} />

    <section className="card profile-security" aria-labelledby="profile-security-title">
      <div className="section-heading"><div><h2 id="profile-security-title">Bảo mật tài khoản</h2><p className="subtle">Đổi mật khẩu định kỳ để bảo vệ lịch họp và dữ liệu nội bộ.</p></div></div>
      <form onSubmit={changePassword}>
        <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>Mật khẩu mới<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
        <label>Xác nhận mật khẩu mới<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
        <button className="dashboard-button secondary" type="submit" disabled={changingPassword}>{changingPassword ? "Đang đổi..." : "Đổi mật khẩu"}</button>
      </form>
    </section>

    <section className="card profile-session" aria-labelledby="profile-session-title">
      <div><h2 id="profile-session-title">Phiên đăng nhập</h2><p>Đăng xuất khỏi phiên hiện tại trên thiết bị này.</p></div>
      <button type="button" className="profile-logout" onClick={() => void onLogout()}>Đăng xuất</button>
    </section>
  </div>;
}
