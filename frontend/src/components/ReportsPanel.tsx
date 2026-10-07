import { FormEvent, useEffect, useState } from "react";
import { api, downloadAuthenticated } from "../services/api";
import type { ReportOverview, Room } from "../types";


function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}


export function ReportsPanel() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(inputDate(new Date(now.getTime() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(inputDate(new Date(now.getTime() + 30 * 86400000)));
  const [roomId, setRoomId] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const params = () => {
    const result = new URLSearchParams({
      date_from: `${dateFrom}T00:00:00+07:00`,
      date_to: `${dateTo}T23:59:59+07:00`,
    });
    if (roomId) result.set("room_id", roomId);
    if (building) result.set("building", building);
    if (floor) result.set("floor", floor);
    return result;
  };

  const load = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      setReport(await api.reportOverview(params()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải báo cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void api.listRooms().then(setRooms).catch(() => setRooms([]));
    void load();
  // Initial range is intentionally loaded once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportReport = async (format: "xlsx" | "pdf") => {
    try {
      await downloadAuthenticated(api.reportExportUrl(format, params()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất báo cáo");
    }
  };

  const maxBookings = Math.max(1, ...(report?.room_usage.map((row) => row.booking_count) ?? [1]));
  return <div className="reports-panel">
    <form className="report-filters" onSubmit={load}>
      <label>Từ ngày<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label>Đến ngày<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      <label>Phòng<select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Tất cả phòng</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <label>Khu nhà<input value={building} onChange={(event) => setBuilding(event.target.value)} placeholder="Ví dụ: Khu A" /></label>
      <label>Tầng<input type="number" min="0" value={floor} onChange={(event) => setFloor(event.target.value)} /></label>
      <button className="primary-action">Xem báo cáo</button>
      <button type="button" onClick={() => void exportReport("xlsx")}>Xuất Excel</button>
      <button type="button" onClick={() => void exportReport("pdf")}>Xuất PDF</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    {loading && <p className="empty">Đang tổng hợp dữ liệu...</p>}
    {report && <>
      <div className="report-metrics">
        <article><span>Tổng cuộc họp</span><strong>{report.summary.total_meetings}</strong></article>
        <article><span>Lượt đặt phòng</span><strong>{report.summary.total_bookings}</strong></article>
        <article><span>Giờ sử dụng</span><strong>{(report.summary.total_booking_minutes / 60).toFixed(1)}</strong></article>
        <article><span>Tỷ lệ hủy</span><strong>{report.summary.cancellation_rate}%</strong></article>
      </div>
      <div className="report-grid">
        <section className="report-section"><h3>Mức sử dụng phòng</h3><div className="bar-chart">{report.room_usage.map((row) => <div className="bar-row" key={row.room_id}><span>{row.room_name}</span><div><i style={{ width: `${row.booking_count * 100 / maxBookings}%` }} /></div><b>{row.booking_count}</b></div>)}</div></section>
        <section className="report-section"><h3>Lý do hủy</h3>{report.cancellation_reasons.length === 0 ? <p className="empty">Chưa có cuộc họp bị hủy.</p> : <ul>{report.cancellation_reasons.map((row) => <li key={row.reason}><span>{row.reason}</span><strong>{row.count}</strong></li>)}</ul>}</section>
        <section className="report-section wide-report-section"><h3>Xu hướng hủy theo ngày</h3>{report.cancellation_trend.length === 0 ? <p className="empty">Không có dữ liệu trong khoảng đã chọn.</p> : <div className="bar-chart">{report.cancellation_trend.map((row) => <div className="bar-row" key={row.date}><span>{row.date}</span><div><i className="cancel-bar" style={{ width: `${row.cancellation_rate}%` }} /></div><b>{row.cancellation_rate}%</b></div>)}</div>}</section>
      </div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>Phòng</th><th>Khu/Tầng</th><th>Lượt đặt</th><th>Số giờ</th><th>Sắp tới</th><th>Hoàn thành</th><th>Đã hủy</th></tr></thead><tbody>{report.room_usage.map((row) => <tr key={row.room_id}><td>{row.room_name}</td><td>{row.building} / {row.floor}</td><td>{row.booking_count}</td><td>{(row.booked_minutes / 60).toFixed(1)}</td><td>{row.scheduled_count}</td><td>{row.completed_count}</td><td>{row.cancelled_count}</td></tr>)}</tbody></table></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>Người tổ chức</th><th>Tổng cuộc họp</th><th>Đã hủy</th><th>Tỷ lệ hủy</th></tr></thead><tbody>{report.organizer_cancellations.map((row) => <tr key={row.organizer_email}><td>{row.organizer_email}</td><td>{row.total_count}</td><td>{row.cancelled_count}</td><td>{row.cancellation_rate}%</td></tr>)}</tbody></table></div>
      <p className="subtle">Múi giờ báo cáo: {report.timezone} · Dữ liệu tạo lúc {new Date(report.generated_at).toLocaleString("vi-VN")}</p>
    </>}
  </div>;
}
