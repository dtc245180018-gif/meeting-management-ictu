import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { RoomDirectory } from "./components/RoomDirectory";
import { api } from "./services/api";
import type { Meeting } from "./types";

type Page = "overview" | "create" | "meetings" | "history" | "rooms";

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filterEmail, setFilterEmail] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | Meeting["status"]>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [error, setError] = useState("");
  const pageSize = 5;

  const loadMeetings = useCallback(async () => {
    try {
      setError("");
      setMeetings(await api.listMeetings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  const visibleMeetings = useMemo(() => {
    const email = filterEmail.trim().toLowerCase();
    const from = filterFrom ? new Date(`${filterFrom}T00:00:00`) : null;
    const to = filterTo ? new Date(`${filterTo}T23:59:59`) : null;
    return meetings.filter((meeting) => {
      const date = new Date(meeting.start_time);
      const matchesEmail = !email || meeting.organizer_email === email || meeting.participants.some((person) => person.email === email);
      const matchesStatus = filterStatus === "all" || meeting.status === filterStatus;
      return matchesEmail && matchesStatus && (!from || date >= from) && (!to || date <= to);
    });
  }, [meetings, filterEmail, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    setHistoryPage(1);
  }, [filterEmail, filterStatus, filterFrom, filterTo]);

  const pagedMeetings = visibleMeetings.slice((historyPage - 1) * pageSize, historyPage * pageSize);
  const totalPages = Math.max(1, Math.ceil(visibleMeetings.length / pageSize));

  const scheduled = meetings.filter((meeting) => meeting.status === "scheduled").length;
  const booked = meetings.filter((meeting) => meeting.booking?.status === "active").length;

  const goTo = (nextPage: Page) => {
    setPage(nextPage);
  };

  const renderHistoryFilters = () => (
    <div className="filter-card">
      <div>
        <span className="eyebrow">US06 · Lịch sử cá nhân</span>
        <strong>Lọc lịch sử cuộc họp</strong>
      </div>
      <input type="email" value={filterEmail} onChange={(event) => setFilterEmail(event.target.value)} placeholder="member@ictu.edu.vn" />
      <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}>
        <option value="all">Tất cả trạng thái</option>
        <option value="scheduled">Đã lên lịch</option>
        <option value="cancelled">Đã hủy</option>
      </select>
      <input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} aria-label="Từ ngày" />
      <input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} aria-label="Đến ngày" />
    </div>
  );

  const renderMeetings = (items: Meeting[], showPagination = false) => (
    <>
      <MeetingList meetings={items} onChanged={loadMeetings} />
      {showPagination && totalPages > 1 && (
        <div className="pagination" aria-label="Phân trang lịch sử">
          <button disabled={historyPage === 1} onClick={() => setHistoryPage((current) => current - 1)}>Trước</button>
          <span>Trang {historyPage} / {totalPages}</span>
          <button disabled={historyPage === totalPages} onClick={() => setHistoryPage((current) => current + 1)}>Sau</button>
        </div>
      )}
    </>
  );

  return (
    <div className="app-shell">
      <header className="ictu-header">
        <div className="ictu-brand">
          <img className="ictu-logo" src="/assets/ICTU.png" alt="Logo Trường Đại học Công nghệ Thông tin và Truyền thông" />
          <div>
            <strong>HỆ THỐNG QUẢN LÝ LỊCH HỌP</strong>
            <span>Trường Đại học Công nghệ Thông tin và Truyền thông</span>
          </div>
        </div>
        <div className="header-user">
          <div><strong>Meeting Management</strong><span>ICTU · Sprint 1</span></div>
          <button onClick={() => goTo("create")}>＋ Tạo lịch</button>
        </div>
      </header>
      <div className="welcome-bar" aria-label="Thông báo chào mừng">
        <div className="welcome-marquee">Chào mừng đến với hệ thống quản lý lịch họp ICTU</div>
      </div>
      <nav className="main-navigation" aria-label="Điều hướng chính">
        <button className={page === "overview" ? "active" : ""} onClick={() => goTo("overview")}><span>⌂</span>Tổng quan</button>
        <button className={page === "create" ? "active" : ""} onClick={() => goTo("create")}><span>＋</span>Tạo lịch họp</button>
        <button className={page === "meetings" ? "active" : ""} onClick={() => goTo("meetings")}><span>▣</span>Cuộc họp</button>
        <button className={page === "history" ? "active" : ""} onClick={() => goTo("history")}><span>◷</span>Lịch sử</button>
        <button className={page === "rooms" ? "active" : ""} onClick={() => goTo("rooms")}><span>⌗</span>Phòng họp</button>
      </nav>
      <main>
        {page === "overview" && (
        <section className="hero">
          <div>
            <span className="eyebrow light">ICTU MEETING · SPRINT 1</span>
            <h1>Lịch họp rõ ràng,<br />phối hợp hiệu quả.</h1>
            <p>Quản lý lịch, thành viên và phòng họp trong một không gian thống nhất dành cho ICTU.</p>
          </div>
          <div className="stats">
            <div><strong>{meetings.length}</strong><span>Tổng lịch</span></div>
            <div><strong>{scheduled}</strong><span>Đang hoạt động</span></div>
            <div><strong>{booked}</strong><span>Đã có phòng</span></div>
          </div>
        </section>
        )}

        {page === "overview" && <section className="sprint-brief" aria-labelledby="product-vision-title">
          <div className="brief-card vision-card">
            <div>
              <span className="eyebrow">Tầm nhìn sản phẩm</span>
              <h2 id="product-vision-title">Họp đúng lúc, đúng chỗ, tối ưu nguồn lực.</h2>
            </div>
            <p>Trở thành giải pháp quản lý lịch họp số 1, giúp tổ chức họp thông minh, tiết kiệm thời gian và sử dụng tài nguyên hiệu quả.</p>
          </div>
        </section>}

        {error && <div className="error-banner">{error}. Hãy kiểm tra Backend tại cổng 8000.</div>}

        {page === "overview" && (
          <section className="overview-grid">
            <div className="overview-card"><span>Cuộc họp sắp tới</span><strong>{scheduled}</strong><button onClick={() => goTo("meetings")}>Xem danh sách →</button></div>
            <div className="overview-card"><span>Phòng đã đặt</span><strong>{booked}</strong><button onClick={() => goTo("rooms")}>Quản lý phòng →</button></div>
            <div className="overview-card"><span>Thao tác nhanh</span><strong>＋</strong><button onClick={() => goTo("create")}>Tạo lịch họp mới →</button></div>
          </section>
        )}
        <div className="page-layout">
          {page === "create" && <MeetingForm onCreated={loadMeetings} />}
          {page === "meetings" && renderMeetings(meetings)}
          {page === "rooms" && <RoomDirectory meetingsCount={meetings.length} />}
          {page === "history" && <div className="content-column">{renderHistoryFilters()}{renderMeetings(pagedMeetings, true)}</div>}
        </div>
      </main>

      <footer>Meeting Management ICTU · Sprint 1 · Nhóm 4</footer>
    </div>
  );
}
