import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { EmailIntegrationStatus, Notification } from "../types";
import { formatIctuDate, formatIctuDateTime, formatIctuTime, toIctuDateTimeInput } from "../utils/dateTime";


interface Props {
  email: string;
  onOpenMeeting?: (meetingId: number) => void;
  onUnreadCountChange?: (count: number) => void;
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


function dayLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}


export function NotificationCenter({ email, onOpenMeeting, onUnreadCountChange }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [notifications, integration] = await Promise.all([api.notifications(email), api.emailStatus()]);
      setItems(notifications);
      onUnreadCountChange?.(notifications.filter((item) => !item.is_read).length);
      setEmailStatus(integration);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải thông báo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [email, onUnreadCountChange]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const read = async (item: Notification) => {
    if (item.is_read) return;
    try {
      const changed = await api.markNotificationRead(item.id, email);
      const nextItems = items.map((value) => value.id === changed.id ? changed : value);
      setItems(nextItems);
      onUnreadCountChange?.(nextItems.filter((value) => !value.is_read).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật thông báo.");
    }
  };

  const openMeeting = async (item: Notification) => {
    await read(item);
    onOpenMeeting?.(item.meeting_id);
  };

  const visibleItems = filter === "unread" ? items.filter((item) => !item.is_read) : items;
  const dayGroups = useMemo(() => {
    const groups = new Map<string, Notification[]>();
    for (const item of visibleItems) {
      const key = toIctuDateTimeInput(item.remind_at).slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [visibleItems]);

  return <section className="card notification-center" aria-labelledby="notification-title">
    <div className="section-heading"><div><span className="eyebrow">US16 · Thông báo và email</span><h2 id="notification-title">Trung tâm thông báo</h2></div><div className="notification-actions"><span className="counter">{items.filter((item) => !item.is_read).length} chưa đọc</span><select aria-label="Lọc thông báo" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Tất cả</option><option value="unread">Chưa đọc</option></select><button className="button secondary" type="button" onClick={() => void load()}>Làm mới</button></div></div>
    <p className="notification-help">Thông báo được nhóm theo ngày, tự làm mới mỗi 15 giây và tự động xóa sau 30 ngày. Bấm một thông báo để đánh dấu đã đọc.</p>
    {emailStatus && <div className={`email-integration-state ${emailStatus.configured ? "real" : "simulation"}`}><strong>{emailStatus.configured ? "SMTP thật đang bật" : "Email đang ở chế độ mô phỏng"}</strong><span>{emailStatus.detail}{emailStatus.sender ? ` · Người gửi: ${emailStatus.sender}` : ""}</span></div>}
    {loading && <p className="empty">Đang tải thông báo...</p>}
    {error && <p className="error-banner inline-error">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="empty">Chưa có thông báo.</p>}
    {!loading && !error && items.length > 0 && visibleItems.length === 0 && <p className="empty">Không còn thông báo chưa đọc.</p>}
    <div className="notification-list">{dayGroups.map(([day, notifications]) => <section className="notification-day-group" key={day} aria-label={dayLabel(notifications[0].remind_at)}>
      <div className="notification-day-heading"><strong>{dayLabel(notifications[0].remind_at)}</strong><span>{notifications.length} thông báo</span></div>
      {notifications.map((item) => <article className={`notification-item ${item.is_read ? "read" : "unread"} ${item.kind === "meeting_starting" ? "meeting-starting" : ""}`} key={item.id}>
      <button className="notification-main" type="button" onClick={() => void read(item)} aria-label={`Đọc thông báo ${item.subject ?? item.meeting_title ?? item.meeting_id}`}>
        <small className="notification-kind">{kindLabels[item.kind]}</small>
        <strong>{item.subject ?? item.meeting_title ?? `Cuộc họp #${item.meeting_id}`}</strong>
        {item.kind === "meeting_starting" && <span className="meeting-starting-copy">Bắt đầu {item.meeting_start_time ? formatIctuDateTime(item.meeting_start_time) : "trong ít phút nữa"} · {item.room_name ?? "Chưa đặt phòng"}</span>}
        {item.body && <span className="notification-preview">{item.body.split("\n")[0]}</span>}
        <small>Thông báo lúc {formatIctuDateTime(item.remind_at)}</small>
      </button>
      <div className="notification-side">
        <time className="notification-time-corner" dateTime={item.remind_at}><strong>{formatIctuDate(item.remind_at)}</strong><span>{formatIctuTime(item.remind_at)}</span></time>
        <b className={`notification-status ${item.status}`}>{item.status === "sent" && emailStatus?.backend === "console" ? "Đã xử lý (console)" : labels[item.status]}</b>
        {item.can_join && onOpenMeeting && <button className="notification-join" type="button" onClick={() => void openMeeting(item)}>Vào họp</button>}
      </div>
    </article>)}</section>)}</div>
  </section>;
}
