import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { EmailIntegrationStatus, Notification } from "../types";
import { formatIctuDateTime, formatIctuTime, toIctuDateTimeInput } from "../utils/dateTime";


interface Props {
  email: string;
  onOpenMeeting?: (meetingId: number) => void;
  onUnreadCountChange?: (count: number) => void;
}


type NotificationFilter = "all" | "unread" | "invitation" | "reminder" | "updates";


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
  attendance_checked_in: "Đã check-in",
  attendance_checked_out: "Đã check-out",
};


function dayLabel(value: string) {
  const today = toIctuDateTimeInput(new Date().toISOString()).slice(0, 10);
  const target = toIctuDateTimeInput(value).slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toIctuDateTimeInput(yesterday.toISOString()).slice(0, 10);
  if (target === today) return "Hôm nay";
  if (target === yesterdayKey) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}


function NotificationKindIcon({ kind }: { kind: Notification["kind"] }) {
  if (kind === "invitation") return <svg viewBox="0 0 24 24"><path d="M4 7h16v11H4zM4 8l8 6 8-6" /></svg>;
  if (kind === "reminder" || kind === "meeting_starting") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
  if (kind === "meeting_cancelled") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
  if (kind === "attendance_checked_in" || kind === "attendance_checked_out") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.2 2.2 4.8-5" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M7 7h10v10H7zM4 12h3M17 12h3M12 4v3M12 17v3" /></svg>;
}


function filterMatches(item: Notification, filter: NotificationFilter) {
  if (filter === "all") return true;
  if (filter === "unread") return !item.is_read;
  if (filter === "invitation") return item.kind === "invitation" || item.kind === "invitation_response";
  if (filter === "reminder") return item.kind === "reminder" || item.kind === "meeting_starting";
  return ["meeting_updated", "meeting_cancelled", "attendance_checked_in", "attendance_checked_out"].includes(item.kind);
}


export function NotificationCenter({ email, onOpenMeeting, onUnreadCountChange }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [query, setQuery] = useState("");

  const updateItems = useCallback((nextItems: Notification[]) => {
    setItems(nextItems);
    onUnreadCountChange?.(nextItems.filter((item) => !item.is_read).length);
  }, [onUnreadCountChange]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [notifications, integration] = await Promise.all([api.notifications(email), api.emailStatus()]);
      updateItems(notifications);
      setEmailStatus(integration);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải thông báo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [email, updateItems]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const read = async (item: Notification) => {
    if (item.is_read) return;
    try {
      const changed = await api.markNotificationRead(item.id, email);
      updateItems(items.map((value) => value.id === changed.id ? changed : value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật thông báo.");
    }
  };

  const readAll = async () => {
    if (!items.some((item) => !item.is_read)) return;
    setProcessing(true);
    setMessage("");
    try {
      const result = await api.markAllNotificationsRead(email);
      updateItems(items.map((item) => ({ ...item, is_read: true })));
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đánh dấu tất cả là đã đọc.");
    } finally {
      setProcessing(false);
    }
  };

  const openMeeting = async (item: Notification) => {
    await read(item);
    onOpenMeeting?.(item.meeting_id);
  };

  const unreadCount = items.filter((item) => !item.is_read).length;
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => filterMatches(item, filter)).filter((item) => !normalizedQuery
      || `${item.subject ?? ""} ${item.meeting_title ?? ""} ${item.body ?? ""} ${item.room_name ?? ""}`.toLowerCase().includes(normalizedQuery));
  }, [filter, items, query]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, Notification[]>();
    for (const item of visibleItems) {
      const key = toIctuDateTimeInput(item.remind_at).slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [visibleItems]);

  return <div className="notifications-page">
    <header className="notifications-heading">
      <div><span>Hoạt động ICTU</span><h1>Thông báo</h1><p>Theo dõi lời mời, thay đổi lịch và trạng thái tham dự của bạn.</p></div>
      <div className="notifications-heading-count"><strong>{unreadCount}</strong><span>chưa đọc</span></div>
    </header>

    <section className="notification-inbox" aria-labelledby="notification-title">
      <h2 className="sr-only" id="notification-title">Trung tâm thông báo</h2>
      <div className="notification-toolbar">
        <div className="notification-tabs" role="tablist" aria-label="Lọc thông báo">
          <button className={filter === "all" ? "active" : ""} type="button" onClick={() => setFilter("all")}>Tất cả</button>
          <button className={filter === "unread" ? "active" : ""} type="button" onClick={() => setFilter("unread")}>Chưa đọc {unreadCount > 0 && <b>{unreadCount}</b>}</button>
          <button className={filter === "invitation" ? "active" : ""} type="button" onClick={() => setFilter("invitation")}>Lời mời</button>
          <button className={filter === "reminder" ? "active" : ""} type="button" onClick={() => setFilter("reminder")}>Nhắc lịch</button>
          <button className={filter === "updates" ? "active" : ""} type="button" onClick={() => setFilter("updates")}>Cập nhật</button>
        </div>
        <div className="notification-toolbar-actions">
          <label className="notification-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm thông báo..." /></label>
          <button type="button" onClick={() => void readAll()} disabled={processing || unreadCount === 0}>Đánh dấu tất cả đã đọc</button>
          <button className="notification-refresh" type="button" onClick={() => void load()} aria-label="Làm mới thông báo" title="Làm mới">↻</button>
        </div>
      </div>

      {message && <p className="notification-feedback" role="status">{message}</p>}
      {loading && <p className="empty notification-empty">Đang tải thông báo...</p>}
      {error && <p className="error-banner inline-error">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="empty notification-empty">Bạn chưa có thông báo nào.</p>}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 && <p className="empty notification-empty">Không có thông báo phù hợp với bộ lọc.</p>}

      <div className="notification-list">{dayGroups.map(([day, notifications]) => <section className="notification-day-group" key={day} aria-label={dayLabel(notifications[0].remind_at)}>
        <div className="notification-day-heading"><strong>{dayLabel(notifications[0].remind_at)}</strong><span>{notifications.length} thông báo</span></div>
        {notifications.map((item) => <article className={`notification-item ${item.is_read ? "read" : "unread"} kind-${item.kind}`} key={item.id}>
          <span className="notification-icon"><NotificationKindIcon kind={item.kind} /></span>
          <button className="notification-main" type="button" onClick={() => onOpenMeeting ? void openMeeting(item) : void read(item)} aria-label={`${kindLabels[item.kind]}: ${item.subject ?? item.meeting_title ?? item.meeting_id}`}>
            <span className="notification-title-row"><small className="notification-kind">{kindLabels[item.kind]}</small>{!item.is_read && <i aria-label="Chưa đọc" />}</span>
            <strong>{item.subject ?? item.meeting_title ?? `Cuộc họp #${item.meeting_id}`}</strong>
            {item.kind === "meeting_starting" && <span className="meeting-starting-copy">Bắt đầu {item.meeting_start_time ? formatIctuDateTime(item.meeting_start_time) : "trong ít phút nữa"} · {item.room_name ?? "Chưa đặt phòng"}</span>}
            {item.body && <span className="notification-preview">{item.body.split("\n")[0]}</span>}
            <span className="notification-meta"><time dateTime={item.remind_at}>{formatIctuTime(item.remind_at)}</time>{item.room_name && <small>{item.room_name}</small>}<small>{labels[item.status]}</small></span>
          </button>
          <div className="notification-side">
            {!item.is_read && <button className="notification-read" type="button" onClick={() => void read(item)}>Đã đọc</button>}
            {item.can_join && onOpenMeeting && <button className="notification-join" type="button" onClick={() => void openMeeting(item)}>Vào họp</button>}
            {!item.can_join && onOpenMeeting && <button className="notification-open" type="button" onClick={() => void openMeeting(item)}>Xem lịch</button>}
          </div>
        </article>)}
      </section>)}</div>
    </section>

    {emailStatus && <details className="notification-delivery">
      <summary>Trạng thái gửi email</summary>
      <div className={`email-integration-state ${emailStatus.configured ? "real" : "simulation"}`}><strong>{emailStatus.configured ? "SMTP thật đang bật" : "Email đang ở chế độ mô phỏng"}</strong><span>{emailStatus.detail}{emailStatus.sender ? ` · Người gửi: ${emailStatus.sender}` : ""}</span></div>
      <p>Thông báo được làm mới mỗi 15 giây và tự động xóa sau 30 ngày.</p>
    </details>}
  </div>;
}
