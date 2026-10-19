import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, downloadAuthenticated } from "../services/api";
import type { ReportOverview, Room } from "../types";


function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function currentMonthRange() {
  const today = new Date();
  return {
    from: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: inputDate(today),
  };
}


export function ReportsPanel() {
  const initialRange = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [roomId, setRoomId] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const buildings = useMemo(
    () => [...new Set(rooms.map((room) => room.building).filter(Boolean))].sort(),
    [rooms],
  );
  const floors = useMemo(
    () => [...new Set(
      rooms
        .filter((room) => !building || room.building === building)
        .map((room) => room.floor)
        .filter((value): value is number => typeof value === "number"),
    )].sort((a, b) => a - b),
    [building, rooms],
  );

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

  const validateRange = () => {
    if (!dateFrom || !dateTo) return "Hãy chọn đầy đủ ngày bắt đầu và ngày kết thúc.";
    if (dateFrom > dateTo) return "Ngày bắt đầu không được sau ngày kết thúc.";
    return "";
  };

  const load = async (event?: FormEvent) => {
    event?.preventDefault();
    const validationError = validateRange();
    if (validationError) {
      setMessage(validationError);
      return;
    }
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

  const applyPreset = (preset: "month" | "30days" | "quarter") => {
    const today = new Date();
    let start: Date;
    if (preset === "30days") {
      start = new Date(today);
      start.setDate(start.getDate() - 29);
    } else if (preset === "quarter") {
      start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    setDateFrom(inputDate(start));
    setDateTo(inputDate(today));
  };

  const resetFilters = () => {
    const range = currentMonthRange();
    setDateFrom(range.from);
    setDateTo(range.to);
    setRoomId("");
    setBuilding("");
    setFloor("");
    setMessage("");
  };

  const exportReport = async (format: "xlsx" | "pdf") => {
    const validationError = validateRange();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setExporting(format);
    setMessage("");
    try {
      await downloadAuthenticated(api.reportExportUrl(format, params()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất báo cáo");
    } finally {
      setExporting(null);
    }
  };

  const maxBookings = Math.max(1, ...(report?.room_usage.map((row) => row.booking_count) ?? [1]));
  return <div className="reports-panel">
    <div className="report-builder">
      <form className="report-filter-card" onSubmit={load}>
        <div className="report-card-heading">
          <div>
            <span>Bộ lọc dữ liệu</span>
            <h3>Chọn phạm vi báo cáo</h3>
            <p>Lọc theo thời gian, phòng, khu nhà hoặc tầng trước khi xem và xuất file.</p>
          </div>
          <div className="report-presets" aria-label="Khoảng thời gian nhanh">
            <button type="button" onClick={() => applyPreset("month")}>Tháng này</button>
            <button type="button" onClick={() => applyPreset("30days")}>30 ngày</button>
            <button type="button" onClick={() => applyPreset("quarter")}>Quý này</button>
          </div>
        </div>
        <div className="report-filter-grid">
          <label>Từ ngày<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>Đến ngày<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label>Phòng<select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Tất cả phòng</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <label>Khu nhà<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(""); }}><option value="">Tất cả khu nhà</option>{buildings.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Tầng<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">Tất cả tầng</option>{floors.map((item) => <option key={item} value={item}>Tầng {item}</option>)}</select></label>
        </div>
        <div className="report-filter-actions">
          <button className="primary-action" disabled={loading}>{loading ? "Đang tổng hợp..." : "Áp dụng bộ lọc"}</button>
          <button type="button" onClick={resetFilters}>Đặt lại</button>
        </div>
      </form>

      <aside className="report-export-card">
        <div className="report-card-heading">
          <div>
            <span>Tài liệu ICTU</span>
            <h3>Xuất báo cáo</h3>
            <p>File xuất sử dụng nhận diện ICTU và giữ đúng bộ lọc đang chọn.</p>
          </div>
        </div>
        <button className="report-export-option excel" type="button" aria-label="Xuất Excel" disabled={exporting !== null} onClick={() => void exportReport("xlsx")}>
          <b>XLSX</b><span><strong>{exporting === "xlsx" ? "Đang tạo Excel..." : "Xuất Excel"}</strong><small>Bảng số liệu có định dạng và trang in A4</small></span>
        </button>
        <button className="report-export-option pdf" type="button" aria-label="Xuất PDF" disabled={exporting !== null} onClick={() => void exportReport("pdf")}>
          <b>PDF</b><span><strong>{exporting === "pdf" ? "Đang tạo PDF..." : "Xuất PDF"}</strong><small>Tài liệu trình bày có logo ICTU chìm</small></span>
        </button>
      </aside>
    </div>

    {message && <p className="notice" role="status">{message}</p>}
    {loading && <p className="empty">Đang tổng hợp dữ liệu...</p>}
    {report && <>
      <div className="report-period-summary">
        <div><span>Kết quả báo cáo</span><strong>{new Date(report.date_from).toLocaleDateString("vi-VN")} - {new Date(report.date_to).toLocaleDateString("vi-VN")}</strong></div>
        <small>Dữ liệu cập nhật lúc {new Date(report.generated_at).toLocaleString("vi-VN")} · UTC+7</small>
      </div>
      <div className="report-metrics">
        <article><span>Tổng cuộc họp</span><strong>{report.summary.total_meetings}</strong></article>
        <article><span>Lượt đặt phòng</span><strong>{report.summary.total_bookings}</strong></article>
        <article><span>Giờ sử dụng</span><strong>{(report.summary.total_booking_minutes / 60).toFixed(1)}</strong></article>
        <article><span>Tỷ lệ hủy</span><strong>{report.summary.cancellation_rate}%</strong></article>
      </div>
      <div className="report-grid">
        <section className="report-section"><h3>Mức sử dụng phòng</h3><div className="bar-chart">{report.room_usage.length === 0 ? <p className="empty">Không có dữ liệu sử dụng phòng.</p> : report.room_usage.map((row) => <div className="bar-row" key={row.room_id}><span>{row.room_name}</span><div><i style={{ width: `${row.booking_count * 100 / maxBookings}%` }} /></div><b>{row.booking_count}</b></div>)}</div></section>
        <section className="report-section"><h3>Lý do hủy</h3>{report.cancellation_reasons.length === 0 ? <p className="empty">Chưa có cuộc họp bị hủy.</p> : <ul>{report.cancellation_reasons.map((row) => <li key={row.reason}><span>{row.reason}</span><strong>{row.count}</strong></li>)}</ul>}</section>
        <section className="report-section wide-report-section"><h3>Xu hướng hủy theo ngày</h3>{report.cancellation_trend.length === 0 ? <p className="empty">Không có dữ liệu trong khoảng đã chọn.</p> : <div className="bar-chart">{report.cancellation_trend.map((row) => <div className="bar-row" key={row.date}><span>{new Date(`${row.date}T00:00:00`).toLocaleDateString("vi-VN")}</span><div><i className="cancel-bar" style={{ width: `${row.cancellation_rate}%` }} /></div><b>{row.cancellation_rate}%</b></div>)}</div>}</section>
      </div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>Phòng</th><th>Khu/Tầng</th><th>Lượt đặt</th><th>Số giờ</th><th>Sắp tới</th><th>Hoàn thành</th><th>Đã hủy</th></tr></thead><tbody>{report.room_usage.map((row) => <tr key={row.room_id}><td>{row.room_name}</td><td>{row.building} / {row.floor}</td><td>{row.booking_count}</td><td>{(row.booked_minutes / 60).toFixed(1)}</td><td>{row.scheduled_count}</td><td>{row.completed_count}</td><td>{row.cancelled_count}</td></tr>)}</tbody></table></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>Người tổ chức</th><th>Tổng cuộc họp</th><th>Đã hủy</th><th>Tỷ lệ hủy</th></tr></thead><tbody>{report.organizer_cancellations.map((row) => <tr key={row.organizer_email}><td>{row.organizer_email}</td><td>{row.total_count}</td><td>{row.cancelled_count}</td><td>{row.cancellation_rate}%</td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
