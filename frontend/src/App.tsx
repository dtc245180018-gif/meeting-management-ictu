import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { RoomDirectory } from "./components/RoomDirectory";
import { api } from "./services/api";
import type { Meeting } from "./types";
import { filterMeetings } from "./utils/meetingFilters";

type Page = "overview" | "create" | "calendar" | "rooms";

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [historyMeetings, setHistoryMeetings] = useState<Meeting[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"all" | "history">("all");
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

  useEffect(() => {
    const email = filterEmail.trim();
    if (page !== "calendar" || calendarMode !== "history" || !email || !email.includes("@")) {
      setHistoryLoading(false);
      return;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryMeetings([]);
    const dateFrom = filterFrom ? `${filterFrom}T00:00:00+07:00` : undefined;
    const dateTo = filterTo ? `${filterTo}T23:59:59.999+07:00` : undefined;
    const loadHistory = async () => {
      const result: Meeting[] = [];
      let offset = 0;
      do {
        const page = await api.history(email, {
          status: filterStatus,
          dateFrom,
          dateTo,
          offset,
          limit: 100,
        });
        result.push(...page);
        offset += page.length;
        if (page.length < 100) break;
      } while (active);
      if (active) {
        setHistoryMeetings(result);
        setError("");
      }
    };
    void loadHistory()
      .catch((err: unknown) => {
        if (active) {
          setHistoryMeetings([]);
          setError(err instanceof Error ? err.message : "Không tải được lịch sử cuộc họp");
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, calendarMode, filterEmail, filterStatus, filterFrom, filterTo]);

  const visibleMeetings = useMemo(() => {
    const source = calendarMode === "history" ? historyMeetings : meetings;
    return filterMeetings(source, {
      email: filterEmail,
      status: filterStatus,
      from: filterFrom,
      to: filterTo,
    });
  }, [meetings, historyMeetings, calendarMode, filterEmail, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    setHistoryPage(1);
  }, [calendarMode, filterEmail, filterStatus, filterFrom, filterTo]);

  const pagedMeetings = visibleMeetings.slice((historyPage - 1) * pageSize, historyPage * pageSize);
  const totalPages = Math.max(1, Math.ceil(visibleMeetings.length / pageSize));

  const now = new Date();
  const businessDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const today = businessDate(now);
  const upcomingMeetings = meetings.filter((meeting) => meeting.status === "scheduled" && new Date(meeting.start_time) >= now);
  const scheduled = upcomingMeetings.length;
  const todayMeetings = meetings.filter((meeting) => {
    const start = new Date(meeting.start_time);
    return meeting.status === "scheduled" && businessDate(start) === today;
  }).length;
  const booked = upcomingMeetings.filter((meeting) => meeting.booking?.status === "active").length;
  const withoutRoom = upcomingMeetings.filter((meeting) => !meeting.booking).length;
  const pendingInvites = upcomingMeetings.reduce(
    (count, meeting) => count + meeting.participants.filter((participant) => participant.status === "invited").length,
    0,
  );
  const recentMeetings = meetings
    .filter((meeting) => meeting.status === "scheduled" && new Date(meeting.start_time) >= now)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
    .slice(0, 5);

  const goTo = (nextPage: Page) => {
    setPage(nextPage);
  };

  const renderHistoryFilters = () => (
    <div className="filter-card">
      <div>
        <span className="eyebrow">US06 · Lịch họp</span>
        <strong>Lọc cuộc họp</strong>
      </div>
      <select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as typeof calendarMode)} aria-label="Phạm vi lịch">
        <option value="all">Tất cả cuộc họp</option>
        <option value="history">Lịch tôi tham gia</option>
      </select>
      <input type="email" value={filterEmail} onChange={(event) => setFilterEmail(event.target.value)} placeholder="member@ictu.edu.vn" />
      <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}>
        <option value="all">Tất cả trạng thái</option>
        <option value="scheduled">Đã lên lịch</option>
        <option value="cancelled">Đã hủy</option>
      </select>
      <input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} aria-label="Từ ngày" />
      <input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} aria-label="Đến ngày" />
      {calendarMode === "history" && !filterEmail && <span className="subtle">Nhập email để xem các cuộc họp bạn được phép xem.</span>}
      {historyLoading && <span className="subtle">Đang tải lịch...</span>}
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
        <button className={page === "calendar" ? "active" : ""} onClick={() => goTo("calendar")}><span>▣</span>Lịch họp</button>
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
            <div><strong>{scheduled}</strong><span>Sắp tới</span></div>
            <div><strong>{booked}</strong><span>Đã có phòng</span></div>
            <div><strong>{withoutRoom}</strong><span>Chưa có phòng</span></div>
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
          <section className="overview-grid" aria-label="Thống kê toàn hệ thống">
            <p className="subtle" style={{ gridColumn: "1 / -1", margin: 0 }}>Thống kê toàn hệ thống · chỉ tính các cuộc họp sắp tới, vì Sprint 1 chưa có đăng nhập cá nhân.</p>
            <div className="overview-card"><span>Cuộc họp hôm nay</span><strong>{todayMeetings}</strong><button onClick={() => goTo("calendar")}>Xem lịch →</button></div>
            <div className="overview-card"><span>Phòng đã đặt</span><strong>{booked}</strong><button onClick={() => goTo("rooms")}>Quản lý phòng →</button></div>
            <div className="overview-card"><span>Lời mời chờ phản hồi</span><strong>{pendingInvites}</strong><button onClick={() => goTo("calendar")}>Xem lời mời →</button></div>
            <div className="overview-card"><span>Thao tác nhanh</span><strong>＋</strong><button onClick={() => goTo("create")}>Tạo lịch họp mới →</button></div>
          </section>
        )}
        {page === "overview" && (
          <section className="card recent-meetings" aria-labelledby="recent-meetings-title">
            <div className="section-heading">
              <div><span className="eyebrow">Lịch gần nhất</span><h2 id="recent-meetings-title">Cuộc họp sắp diễn ra</h2></div>
              <button className="button secondary" onClick={() => goTo("calendar")}>Xem tất cả</button>
            </div>
            <div className="recent-list">
              {recentMeetings.length === 0 && <p className="empty">Chưa có cuộc họp nào.</p>}
              {recentMeetings.map((meeting) => (
                <div className="recent-item" key={meeting.id}>
                  <strong>{meeting.title}</strong>
                  <span>{new Date(meeting.start_time).toLocaleString("vi-VN")} · {meeting.booking?.room.name ?? "Chưa đặt phòng"}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="page-layout">
          {page === "create" && <MeetingForm onCreated={loadMeetings} />}
          {page === "calendar" && <div className="content-column">{renderHistoryFilters()}{renderMeetings(pagedMeetings, true)}</div>}
          {page === "rooms" && <RoomDirectory meetings={meetings} />}
        </div>
      </main>

      <footer>Meeting Management ICTU · Sprint 1 · Nhóm 4</footer>
    </div>
  );
}
