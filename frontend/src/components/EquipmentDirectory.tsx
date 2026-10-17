import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { Equipment, EquipmentStatus } from "../types";
import { ictuInputToIso } from "../utils/dateTime";


function toIso(value: string) {
  return ictuInputToIso(value);
}


const statusLabel: Record<EquipmentStatus, string> = {
  available: "Sẵn sàng",
  booked: "Đã được đặt",
  maintenance: "Đang bảo trì",
  inactive: "Ngừng sử dụng",
};


export function EquipmentDirectory() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async (options: Parameters<typeof api.listEquipment>[0] = {}) => {
    setLoading(true);
    setMessage("");
    try {
      setItems(await api.listEquipment(options));
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "Không thể tải thiết bị.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    if ((startTime && !endTime) || (!startTime && endTime)) {
      setMessage("Hãy nhập đủ thời gian bắt đầu và kết thúc.");
      return;
    }
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      setMessage("Khoảng thời gian sử dụng không hợp lệ.");
      return;
    }
    void load({
      startTime: startTime ? toIso(startTime) : undefined,
      endTime: endTime ? toIso(endTime) : undefined,
      category: category || undefined,
      status: status || undefined,
    });
  };

  const reset = () => {
    setCategory("");
    setStatus("");
    setStartTime("");
    setEndTime("");
    void load();
  };

  return <div className="module-page equipment-directory-page">
    <header className="module-page-heading">
      <div><span>Tài nguyên ICTU</span><h1>Thiết bị</h1><p>Tra cứu thiết bị theo loại, trạng thái và khung thời gian sử dụng.</p></div>
      <div className="module-heading-status"><strong>{items.length}</strong><span>thiết bị hiển thị</span></div>
    </header>
    <section className="module-summary-grid equipment-summary-grid" aria-label="Tổng quan thiết bị">
      <article><span>Sẵn sàng</span><strong>{items.filter((item) => item.status === "available").length}</strong><small>Có thể sử dụng</small></article>
      <article><span>Đã được đặt</span><strong>{items.filter((item) => item.status === "booked").length}</strong><small>Trong khung giờ chọn</small></article>
      <article><span>Bảo trì / ngừng dùng</span><strong>{items.filter((item) => item.status === "maintenance" || item.status === "inactive").length}</strong><small>Cần kiểm tra trước khi dùng</small></article>
    </section>
    <section className="module-surface equipment-directory">
    <div className="module-section-heading"><div><span>Danh mục tài sản</span><h2>Tìm thiết bị phù hợp</h2></div><p>Có thể bỏ trống thời gian để xem toàn bộ kho.</p></div>
    <form className="equipment-filter" onSubmit={search}>
      <label>Loại thiết bị
        <select aria-label="Loại thiết bị" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Tất cả</option>
          {categories.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
      <label>Trạng thái
        <select aria-label="Trạng thái thiết bị" value={status} onChange={(event) => setStatus(event.target.value as EquipmentStatus | "")}>
          <option value="">Tất cả</option>
          <option value="available">Sẵn sàng</option>
          <option value="booked">Đã được đặt</option>
          <option value="maintenance">Đang bảo trì</option>
          <option value="inactive">Ngừng sử dụng</option>
        </select>
      </label>
      <details className="equipment-time-filter">
        <summary>Kiểm tra theo khung giờ <small>Không bắt buộc</small></summary>
        <div><label>Từ lúc<input aria-label="Thiết bị từ lúc" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Đến lúc<input aria-label="Thiết bị đến lúc" type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
      </details>
      <div className="filter-actions"><button className="button primary" type="submit">Áp dụng bộ lọc</button><button className="button secondary" type="button" onClick={reset}>Đặt lại</button></div>
    </form>
    {message && <p className="error-banner inline-error">{message}</p>}
    {loading ? <p className="empty">Đang tải thiết bị...</p> : <div className="equipment-grid">
      {items.length === 0 && <p className="empty">Không có thiết bị phù hợp.</p>}
      {items.map((item) => <article className={`equipment-card ${item.status}`} key={item.id}>
        <div><strong>{item.code}</strong><b className={`equipment-status ${item.status}`}>{statusLabel[item.status]}</b></div>
        <h3>{item.name}</h3>
        <span>{item.category} · {item.location}</span>
      </article>)}
    </div>}
    <p className="subtle">Trạng thái “Đã được đặt” được hệ thống tính theo đúng khoảng thời gian tìm kiếm.</p>
    </section>
  </div>;
}
