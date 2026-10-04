import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { GoogleConnectionStatus } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


interface Props {
  email: string;
}


export function GoogleCalendarPanel({ email }: Props) {
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.googleStatus(email));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đọc trạng thái Google Calendar.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    try {
      setMessage("Đang chuyển tới Google để cấp quyền...");
      const result = await api.googleConnectUrl(email);
      window.location.assign(result.authorization_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể bắt đầu kết nối Google.");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Ngắt kết nối Google Calendar? Các sự kiện đã tạo trên Google sẽ được giữ lại nhưng không còn tự cập nhật.")) return;
    try {
      const result = await api.disconnectGoogle(email);
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể ngắt kết nối Google.");
    }
  };

  return <section className="card google-calendar-panel" aria-labelledby="google-calendar-title">
    <div className="section-heading">
      <div><span className="eyebrow">US15 · Google Calendar API</span><h2 id="google-calendar-title">Lịch Google của bạn</h2></div>
      {status?.connected && <span className="integration-state connected">Đã kết nối</span>}
    </div>
    {loading && <p className="empty">Đang kiểm tra kết nối...</p>}
    {message && <p className="notice">{message}</p>}
    {!loading && status && !status.configured && <div className="integration-warning">
      <strong>Backend chưa có thông tin OAuth.</strong>
      <span>Thêm các biến sau vào backend/.env rồi khởi động lại: {status.missing_settings.join(", ")}.</span>
    </div>}
    {!loading && status?.configured && !status.connected && <div className="integration-content">
      <p>Kết nối để hệ thống tạo, cập nhật và hủy sự kiện thật trên Google Calendar; lời mời được Google gửi tới người tham dự.</p>
      <button className="button primary" type="button" onClick={() => void connect()}>Kết nối Google Calendar</button>
    </div>}
    {!loading && status?.connected && <div className="integration-content">
      <p><strong>{status.google_email}</strong> đang là lịch đích. Những cuộc họp bạn tổ chức có thể đồng bộ trực tiếp và gửi cập nhật tới khách mời.</p>
      {status.connected_at && <small>Kết nối lúc {formatIctuDateTime(status.connected_at)}</small>}
      <div className="item-actions">
        <button className="button secondary" type="button" onClick={() => void load()}>Kiểm tra lại</button>
        <button className="button secondary danger-outline" type="button" onClick={() => void disconnect()}>Ngắt kết nối</button>
      </div>
    </div>}
  </section>;
}
