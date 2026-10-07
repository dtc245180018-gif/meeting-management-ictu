import { FormEvent, useState } from "react";
import { api, authStorage } from "../services/api";
import type { Account } from "../types";


interface Props {
  account?: Account;
  onAuthenticated: (account: Account) => void;
  onPasswordChanged: () => void;
}


export function LoginPage({ account, onAuthenticated, onPasswordChanged }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await api.login(email, password);
      authStorage.set(result.access_token);
      onAuthenticated(result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đăng nhập");
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await api.changePassword(currentPassword, newPassword);
      authStorage.clear();
      onPasswordChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-brand">
      <img src="/assets/ICTU.png" alt="ICTU" />
      <span className="eyebrow light">ICTU · SPRINT 3</span>
      <h1>Meeting Management</h1>
      <p>Quản lý lịch họp, phòng và tài nguyên theo đúng vai trò của từng cán bộ.</p>
    </section>
    <section className="auth-card">
      {account?.must_change_password ? <>
        <span className="eyebrow">Bảo mật tài khoản</span>
        <h2>Đổi mật khẩu lần đầu</h2>
        <p className="subtle">Xin chào {account.full_name}. Bạn cần đặt mật khẩu riêng trước khi sử dụng hệ thống.</p>
        <form onSubmit={submitPassword}>
          <label>Mật khẩu tạm thời<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Xác nhận mật khẩu mới<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button className="primary-action" disabled={loading}>{loading ? "Đang cập nhật..." : "Đổi mật khẩu"}</button>
        </form>
      </> : <>
        <span className="eyebrow">Đăng nhập nội bộ</span>
        <h2>Chào mừng trở lại</h2>
        <form onSubmit={submitLogin}>
          <label>Email ICTU<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tenban@ictu.edu.vn" /></label>
          <label>Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary-action" disabled={loading}>{loading ? "Đang đăng nhập..." : "Đăng nhập"}</button>
        </form>
        <p className="subtle">Tài khoản mới sử dụng mật khẩu tạm thời do quản trị viên cung cấp.</p>
      </>}
      {message && <p className="error-banner" role="alert">{message}</p>}
    </section>
  </main>;
}
