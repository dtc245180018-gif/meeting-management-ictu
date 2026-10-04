import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { EmailIntegrationStatus, Notification } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


interface Props {
  email: string;
  onOpenMeeting?: (meetingId: number) => void;
}


const labels: Record<Notification["status"], string> = {
  pending: "Đang chờ gửi",
  sent: "Đã gửi",
  failed: "Gửi thất bại",
  cancelled: "Đã hủy",
};

const kindLabels: Record<Notification["kind"], string> = {
  reminder: "Nhắc lịch",
  meeting_starting: "Sắp đến giờ họp",
  invitation: "Lời mời mới",
  meeting_updated: "Lịch đã cập nhật",
  meeting_cancelled: "Lịch đã hủy",
  invitation_response: "Phản hồi lời mời",
};


export function NotificationCenter({ email, onOpenMeeting }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [notifications, integration] = await Promise.all([api.notifications(email), api.emailStatus()]);
      setItems(notifications);
      setEmailStatus(integration);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải thông báo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const read = async (item: Notification) => {
    if (item.is_read) return;
    try {
      const changed = await api.markNotificationRead(item.id, email);
      setItems((current) => current.map((value) => value.id === changed.id ? changed : value));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật thông báo.");
    }
  };

  const openMeeting = async (item: Notification) => {
    await read(item);
    onOpenMeeting?.(item.meeting_id);
  };

  return <section className="card notification-center" aria-labelledby="notification-title">
    <div className="section-heading"><div><span className="eyebrow">US16 · Thông báo và email</span><h2 id="notification-title">Thông báo của bạn</h2></div><div className="notification-actions"><span className="counter">{items.filter((item) => !item.is_read).length} chưa đọc</span><button className="button secondary" type="button" onClick={() => void load()}>Làm mới</button></div></div>
    <p className="notification-help">Hệ thống tự làm mới mỗi 15 giây và hiển thị trạng thái gửi email thật cho lời mời, thay đổi, hủy lịch, phản hồi và nhắc lịch. Bấm một thông báo để đánh dấu đã đọc.</p>
    {emailStatus && <div className={`email-integration-state ${emailStatus.configured ? "real" : "simulation"}`}><strong>{emailStatus.configured ? "SMTP thật đang bật" : "Email đang ở chế độ mô phỏng"}</strong><span>{emailStatus.detail}{emailStatus.sender ? ` · Người gửi: ${emailStatus.sender}` : ""}</span></div>}
    {loading && <p className="empty">Đang tải thông báo...</p>}
    {error && <p className="error-banner inline-error">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="empty">Chưa có thông báo nhắc lịch.</p>}
    <div className="notification-list">{items.map((item) => <article className={`notification-item ${item.is_read ? "read" : "unread"} ${item.kind === "meeting_starting" ? "meeting-starting" : ""}`} key={item.id}>
      <button className="notification-main" type="button" onClick={() => void read(item)} aria-label={`Đọc thông báo ${item.subject ?? item.meeting_title ?? item.meeting_id}`}>
        <small className="notification-kind">{kindLabels[item.kind]}</small>
        <strong>{item.subject ?? item.meeting_title ?? `Cuộc họp #${item.meeting_id}`}</strong>
        {item.kind === "meeting_starting" && <span className="meeting-starting-copy">Bắt đầu {item.meeting_start_time ? formatIctuDateTime(item.meeting_start_time) : "trong ít phút nữa"} · {item.room_name ?? "Chưa đặt phòng"}</span>}
        {item.body && <span className="notification-preview">{item.body.split("\n")[0]}</span>}
        <small>Thông báo lúc {formatIctuDateTime(item.remind_at)}</small>
      </button>
      <div className="notification-side">
        <b className={`notification-status ${item.status}`}>{item.status === "sent" && emailStatus?.backend === "console" ? "Đã xử lý (console)" : labels[item.status]}</b>
        {item.kind === "meeting_starting" && item.status !== "cancelled" && onOpenMeeting && <button className="notification-join" type="button" onClick={() => void openMeeting(item)}>Vào họp</button>}
      </div>
    </article>)}</div>
  </section>;
}
