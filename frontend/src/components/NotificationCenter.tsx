import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Notification } from "../types";


interface Props {
  email: string;
}


const labels: Record<Notification["status"], string> = {
  pending: "Đang chờ gửi",
  sent: "Đã gửi",
  failed: "Gửi thất bại",
  cancelled: "Đã hủy",
};


export function NotificationCenter({ email }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.notifications(email));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải thông báo.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  const read = async (item: Notification) => {
    if (item.is_read) return;
    try {
      const changed = await api.markNotificationRead(item.id, email);
      setItems((current) => current.map((value) => value.id === changed.id ? changed : value));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật thông báo.");
    }
  };

  return <section className="card notification-center" aria-labelledby="notification-title">
    <div className="section-heading"><div><span className="eyebrow">US16 · Nhắc lịch</span><h2 id="notification-title">Thông báo của bạn</h2></div><span className="counter">{items.filter((item) => !item.is_read).length} chưa đọc</span></div>
    {loading && <p className="empty">Đang tải thông báo...</p>}
    {error && <p className="error-banner inline-error">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="empty">Chưa có thông báo nhắc lịch.</p>}
    <div className="notification-list">{items.map((item) => <button className={item.is_read ? "read" : "unread"} key={item.id} onClick={() => void read(item)}>
      <span><strong>{item.meeting_title ?? `Cuộc họp #${item.meeting_id}`}</strong><small>{new Date(item.remind_at).toLocaleString("vi-VN")}</small></span>
      <b className={`notification-status ${item.status}`}>{labels[item.status]}</b>
    </button>)}</div>
  </section>;
}
