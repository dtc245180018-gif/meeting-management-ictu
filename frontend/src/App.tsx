import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { api } from "./services/api";
import type { Meeting } from "./types";

export default function App() {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" aria-label="Meeting Management ICTU">
            <span className="brand-mark">ICTU</span>
            <span className="brand-copy">
              <strong>Meeting Management</strong>
              <span>Trường Đại học Công nghệ Thông tin và Truyền thông</span>
            </span>
          </a>
          <nav aria-label="Điều hướng chính">
            <a href="#create">Tạo lịch</a>
            <a href="#meetings">Danh sách cuộc họp</a>
          </nav>
        </div>
      </header>

      <main>
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

        <section className="sprint-brief" aria-labelledby="sprint-brief-title">
          <div className="brief-card">
            <span className="eyebrow">Tầm nhìn sản phẩm</span>
            <h2 id="sprint-brief-title">Họp đúng lúc, đúng chỗ, tối ưu nguồn lực.</h2>
            <p>Trở thành giải pháp quản lý lịch họp số 1, giúp tổ chức họp thông minh, tiết kiệm thời gian và sử dụng tài nguyên hiệu quả.</p>
          </div>
          <div className="brief-card sprint-goal">
            <span className="eyebrow">Mục tiêu Sprint 1</span>
            <h2>Hoàn thiện luồng MVP quản lý cuộc họp</h2>
            <p>Tạo và quản lý lịch, mời người tham dự, tìm thời gian phù hợp, xem phòng trống và đặt phòng không trùng lịch.</p>
          </div>
        </section>

        {error && <div className="error-banner">{error}. Hãy kiểm tra Backend tại cổng 8000.</div>}

        <div className="workspace">
          <div id="create"><MeetingForm onCreated={loadMeetings} /></div>
          <div id="meetings" className="content-column">
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
            <MeetingList meetings={pagedMeetings} onChanged={loadMeetings} />
            {totalPages > 1 && (
              <div className="pagination" aria-label="Phân trang lịch sử">
                <button disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)}>Trước</button>
                <span>Trang {historyPage} / {totalPages}</span>
                <button disabled={historyPage === totalPages} onClick={() => setHistoryPage((page) => page + 1)}>Sau</button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer>Meeting Management ICTU · Sprint 1 · Nhóm 4</footer>
    </div>
  );
}
