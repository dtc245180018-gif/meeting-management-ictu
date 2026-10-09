import { FormEvent, useState } from "react";
import { api, authStorage } from "../services/api";
import type { Account } from "../types";
import { InstallAppButton } from "./InstallAppButton";


interface Props {
  account?: Account;
  onAuthenticated: (account: Account) => void;
  onPasswordChanged: () => void;
}


interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  placeholder?: string;
  hideLabel?: boolean;
  error?: string;
  onChange: (value: string) => void;
}


function PasswordField({ id, label, value, autoComplete, minLength, placeholder, hideLabel = false, error, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return <div className="password-field">
    <label className={hideLabel ? "sr-only" : undefined} htmlFor={id}>{label}</label>
    <div className="password-input-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        className={error ? "input-invalid" : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      </button>
    </div>
    {error && <small className="auth-field-error" id={`${id}-error`}>{error}</small>}
  </div>;
}


export function LoginPage({ account, onAuthenticated, onPasswordChanged }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setEmailError("");
    setPasswordError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailError("Vui lòng nhập email đăng nhập.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError("Email không đúng định dạng.");
      return;
    }
    if (!password) {
      setPasswordError("Vui lòng nhập mật khẩu.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await api.login(normalizedEmail, password);
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
    <header className="auth-header">
      <div className="auth-header-inner">
        <div className="auth-header-brand">
          <img src="/assets/ICTU.png" alt="Logo ICTU" />
          <div className="auth-header-copy">
            <strong>HỆ THỐNG QUẢN LÝ LỊCH HỌP</strong>
            <span>Trường Đại học Công nghệ Thông tin và Truyền thông</span>
          </div>
        </div>
        <InstallAppButton location="header" />
      </div>
    </header>
    <section className="auth-stage">
      <section className="auth-card">
        {account?.must_change_password ? <>
          <h1>Đổi mật khẩu lần đầu</h1>
          <p className="auth-intro">Xin chào {account.full_name}. Bạn cần đặt mật khẩu riêng trước khi sử dụng hệ thống.</p>
          <form onSubmit={submitPassword}>
            <PasswordField id="current-password" label="Mật khẩu tạm thời" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
            <PasswordField id="new-password" label="Mật khẩu mới" autoComplete="new-password" minLength={8} value={newPassword} onChange={setNewPassword} />
            <PasswordField id="confirm-password" label="Xác nhận mật khẩu mới" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={setConfirmPassword} />
            <button className="primary-action" disabled={loading}>{loading ? "Đang cập nhật..." : "Đổi mật khẩu"}</button>
          </form>
        </> : <>
          <h1>Đăng Nhập</h1>
          <form className="auth-login-form" noValidate onSubmit={submitLogin}>
            <div className="auth-input-field">
              <label className="sr-only" htmlFor="login-email">Email đăng nhập</label>
              <input id="login-email" type="email" inputMode="email" autoComplete="username" className={emailError ? "input-invalid" : undefined} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "login-email-error" : undefined} value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(""); setMessage(""); }} placeholder="Email đăng nhập" />
              {emailError && <small className="auth-field-error" id="login-email-error">{emailError}</small>}
            </div>
            <PasswordField id="login-password" label="Mật khẩu" hideLabel placeholder="Mật khẩu" autoComplete="current-password" value={password} error={passwordError} onChange={(value) => { setPassword(value); setPasswordError(""); }} />
            <button className="auth-forgot" type="button" onClick={() => setHelpMessage("Vui lòng liên hệ quản trị viên hệ thống để được đặt lại mật khẩu.")}>Quên mật khẩu?</button>
            <button className="primary-action" disabled={loading}>{loading ? "Đang đăng nhập..." : "Đăng nhập"}</button>
          </form>
        </>}
        {message && <p className="error-banner" role="alert">{message}</p>}
        {helpMessage && <p className="auth-help-message" role="status">{helpMessage}</p>}
        <div className="auth-security-note">Hệ thống chỉ mang mục đích học tập và tham khảo,<br /><strong>KHÔNG</strong> mang mục đích mạo danh hay lừa đảo hoặc<br />bất kỳ hoạt động mua bán nào.</div>
      </section>
    </section>
    <footer className="auth-footer">
      <span>© 2026 Meeting Management ICTU.</span>
      <strong className="auth-developer">Dev Nguyễn Ngọc Thắng · KTPM K23A <span className="verified-badge" role="img" aria-label="Tác giả đã xác minh" title="Đã xác minh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.1 1.8 2.8-.2.9 2.7 2.4 1.5-.7 2.7 1.3 2.5-1.8 2.1.2 2.8-2.7.9-1.5 2.4-2.7-.7-2.5 1.3-2.1-1.8-2.8.2-.9-2.7-2.4-1.5.7-2.7-1.3-2.5 1.8-2.1-.2-2.8 2.7-.9L9.3 3.6l2.7.7L12 2Z"/><path d="m8.4 12.1 2.2 2.2 5-5" /></svg></span></strong>
    </footer>
  </main>;
}
