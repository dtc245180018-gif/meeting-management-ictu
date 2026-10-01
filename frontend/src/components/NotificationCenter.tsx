import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Notification } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


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
    <div className="section-heading"><div><span className="eyebrow">US16 · Nhắc lịch</span><h2 id="notification-title">Thông báo của bạn</h2></div><div className="notification-actions"><span className="counter">{items.filter((item) => !item.is_read).length} chưa đọc</span><button className="button secondary" type="button" onClick={() => void load()}>Làm mới</button></div></div>
    <p className="notification-help">Reminder được tạo khi lập cuộc họp; trạng thái <strong>Đang chờ gửi</strong> sẽ chuyển thành <strong>Đã gửi</strong> khi worker nền xử lý đến hạn. EMAIL_BACKEND=console chỉ mô phỏng gửi email trong môi trường demo. Bấm một thông báo để đánh dấu đã đọc.</p>
    {loading && <p className="empty">Đang tải thông báo...</p>}
    {error && <p className="error-banner inline-error">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="empty">Chưa có thông báo nhắc lịch.</p>}
    <div className="notification-list">{items.map((item) => <button className={item.is_read ? "read" : "unread"} key={item.id} onClick={() => void read(item)}>
      <span><strong>{item.meeting_title ?? `Cuộc họp #${item.meeting_id}`}</strong><small>{formatIctuDateTime(item.remind_at)}</small></span>
      <b className={`notification-status ${item.status}`}>{labels[item.status]}</b>
    </button>)}</div>
  </section>;
}
