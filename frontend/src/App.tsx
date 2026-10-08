import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { RoomDirectory } from "./components/RoomDirectory";
import { EquipmentDirectory } from "./components/EquipmentDirectory";
import { AdminPanel } from "./components/AdminPanel";
import { NotificationCenter } from "./components/NotificationCenter";
import { GoogleCalendarPanel } from "./components/GoogleCalendarPanel";
import { LoginPage } from "./components/LoginPage";
import { InstallAppButton } from "./components/InstallAppButton";
import { api, authStorage } from "./services/api";
import type { Account, Employee, Meeting } from "./types";
import { filterMeetings } from "./utils/meetingFilters";
import { loadAllHistory } from "./utils/historyPagination";
import { formatIctuDateTime } from "./utils/dateTime";
import { countPendingInvitations, scopeDashboardMeetings } from "./utils/dashboard";

type Page = "overview" | "create" | "calendar" | "notifications" | "rooms" | "equipment" | "admin";

const TEST_ACCOUNT: Account = {
  id: 1,
  employee_id: 1,
  email: "leader@example.com",
  full_name: "Quản trị viên",
  department: "ICTU",
  role: "admin",
  must_change_password: false,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

function isMobileViewport() {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
}

export default function App() {
  const testing = import.meta.env.MODE === "test";
  const [account, setAccount] = useState<Account | undefined>(testing ? TEST_ACCOUNT : undefined);
  const [authLoading, setAuthLoading] = useState(!testing);
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    if (testing) return;
    let active = true;
    const restore = async () => {
      if (!authStorage.get()) {
        setAuthLoading(false);
        return;
      }
      try {
        const current = await api.me();
        if (active) setAccount(current);
      } catch {
        authStorage.clear();
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    const expired = () => {
      authStorage.clear();
      setAccount(undefined);
      setAuthNotice("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    };
    window.addEventListener("ictu-auth-expired", expired);
    void restore();
    return () => {
      active = false;
      window.removeEventListener("ictu-auth-expired", expired);
    };
  }, [testing]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // The local session must still be cleared if the server is unavailable.
    }
    authStorage.clear();
    setAccount(undefined);
    setAuthNotice("Bạn đã đăng xuất an toàn.");
  };

  if (authLoading) return <main className="auth-loading">Đang khôi phục phiên đăng nhập...</main>;
  if (!account || account.must_change_password) {
    return <>
      {authNotice && <div className="auth-global-notice" role="status">{authNotice}</div>}
      <LoginPage
        account={account}
        onAuthenticated={(next) => { setAuthNotice(""); setAccount(next); }}
        onPasswordChanged={() => { setAccount(undefined); setAuthNotice("Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới."); }}
      />
    </>;
  }
  return <AuthenticatedApp account={account} onLogout={logout} />;
}


function AuthenticatedApp({ account, onLogout }: { account: Account; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobileViewport);
  const [focusedMeetingId, setFocusedMeetingId] = useState<number | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historyMeetings, setHistoryMeetings] = useState<Meeting[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"all" | "history">("all");
  const [filterEmail, setFilterEmail] = useState("");
  const [calendarEmailInput, setCalendarEmailInput] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | Meeting["status"]>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [error, setError] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [lastSeenMeetingId, setLastSeenMeetingId] = useState(0);
  const pageSize = 5;
  const activeUser = { email: account.email, label: account.full_name };
  const activeRole = account.role;

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
    void api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
    const timer = window.setInterval(() => { void loadMeetings(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadMeetings]);

  useEffect(() => {
    let active = true;
    const loadBadge = async () => {
      try {
        const notifications = await api.notifications(activeUser.email);
        if (active) setUnreadNotificationCount(notifications.filter((item) => !item.is_read).length);
      } catch {
        if (active) setUnreadNotificationCount(0);
      }
    };
    void loadBadge();
    const timer = window.setInterval(() => { void loadBadge(); }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeUser.email]);

  useEffect(() => {
    const stored = window.localStorage.getItem(`meeting-last-seen:${activeUser.email.toLowerCase()}`);
    setLastSeenMeetingId(Number(stored) || 0);
  }, [activeUser.email]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_calendar") === "connected") {
      setPage("overview");
      setSystemMessage(`Đã kết nối Google Calendar cho ${params.get("email") ?? "tài khoản hiện tại"}.`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("meeting")) {
      setPage("calendar");
    }
  }, []);

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
      const result = await loadAllHistory((offset, limit) => api.history(email, {
          status: filterStatus,
          dateFrom,
          dateTo,
          offset,
          limit,
        }));
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
  const scopedMeetings = scopeDashboardMeetings(meetings, activeUser.email, activeRole === "admin");
  const upcomingMeetings = scopedMeetings
    .filter((meeting) => meeting.status === "scheduled" && new Date(meeting.start_time).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
  const scheduled = upcomingMeetings.length;
  const todayMeetings = scopedMeetings.filter((meeting) => {
    const start = new Date(meeting.start_time);
    return meeting.status === "scheduled" && businessDate(start) === today;
  }).length;
  const booked = upcomingMeetings.filter((meeting) => meeting.booking?.status === "active").length;
  const withoutRoom = upcomingMeetings.filter((meeting) => !meeting.booking).length;
  const pendingInvites = countPendingInvitations(upcomingMeetings, activeUser.email, activeRole === "admin");
  const newestMeetingId = scopedMeetings.reduce((latest, meeting) => Math.max(latest, meeting.id), 0);
  const hasNewMeetings = newestMeetingId > lastSeenMeetingId;
  useEffect(() => {
    if (page !== "calendar" || !newestMeetingId) return;
    setLastSeenMeetingId(newestMeetingId);
    window.localStorage.setItem(`meeting-last-seen:${activeUser.email.toLowerCase()}`, String(newestMeetingId));
  }, [page, newestMeetingId, activeUser.email]);
  const recentMeetings = upcomingMeetings.slice(0, 5);
  const calendarEmployeeSuggestions = employees
    .filter((employee) => {
      const query = calendarEmailInput.trim().toLowerCase();
      return Boolean(query) && `${employee.full_name} ${employee.email} ${employee.department}`.toLowerCase().includes(query);
    })
    .slice(0, 6);

  const markMeetingsSeen = () => {
    if (!newestMeetingId) return;
    setLastSeenMeetingId(newestMeetingId);
    window.localStorage.setItem(`meeting-last-seen:${activeUser.email.toLowerCase()}`, String(newestMeetingId));
  };

  const goTo = (nextPage: Page) => {
    if (nextPage === "calendar") markMeetingsSeen();
    setPage(nextPage);
    if (isMobileViewport()) setSidebarCollapsed(true);
  };

  const searchCalendar = (event?: FormEvent) => {
    event?.preventDefault();
    setFilterEmail(calendarEmailInput.trim());
    setHistoryPage(1);
  };

  const showMyInvitations = () => {
    setCalendarMode("all");
    setCalendarEmailInput(activeUser.email);
    setFilterEmail(activeUser.email);
    setFilterStatus("scheduled");
    setHistoryPage(1);
    markMeetingsSeen();
    setPage("calendar");
    if (isMobileViewport()) setSidebarCollapsed(true);
  };

  const openMeetingFromNotification = (meetingId: number) => {
    setCalendarMode("all");
    setCalendarEmailInput(activeUser.email);
    setFilterEmail(activeUser.email);
    setFilterStatus("scheduled");
    setFilterFrom("");
    setFilterTo("");
    const meetingIndex = meetings.findIndex((meeting) => meeting.id === meetingId);
    setHistoryPage(meetingIndex >= 0 ? Math.floor(meetingIndex / pageSize) + 1 : 1);
    setFocusedMeetingId(meetingId);
    markMeetingsSeen();
    setPage("calendar");
    if (isMobileViewport()) setSidebarCollapsed(true);
  };

  const renderHistoryFilters = () => (
    <form className="filter-card" onSubmit={searchCalendar}>
      <div>
        <span className="eyebrow">US06 · Lịch họp</span>
        <strong>Lọc cuộc họp</strong>
      </div>
      <select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as typeof calendarMode)} aria-label="Phạm vi lịch">
        <option value="all">Tất cả cuộc họp</option>
        <option value="history">Lịch tôi tham gia</option>
      </select>
      <label className="calendar-email-filter">Email người tham gia
        <input type="email" value={calendarEmailInput} onChange={(event) => setCalendarEmailInput(event.target.value)} placeholder="member@ictu.edu.vn" />
        {calendarEmployeeSuggestions.length > 0 && (
          <div className="employee-suggestions calendar-suggestions" role="listbox" aria-label="Gợi ý email nhân viên">
            {calendarEmployeeSuggestions.map((employee) => (
              <button type="button" key={employee.email} onClick={() => setCalendarEmailInput(employee.email)}>
                <strong>{employee.full_name}</strong>
                <span>{employee.email} · {employee.department}</span>
              </button>
            ))}
          </div>
        )}
      </label>
      <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}>
        <option value="all">Tất cả trạng thái</option>
        <option value="scheduled">Đã lên lịch</option>
        <option value="cancelled">Đã hủy</option>
      </select>
      <input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} aria-label="Từ ngày" />
      <input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} aria-label="Đến ngày" />
      <button className="button primary calendar-search-button" type="submit">Tìm</button>
      <button className="button secondary" type="button" onClick={() => { setCalendarEmailInput(""); setFilterEmail(""); setFilterStatus("all"); setFilterFrom(""); setFilterTo(""); }}>Xóa</button>
      {calendarMode === "history" && !filterEmail && <span className="subtle">Nhập email để xem các cuộc họp bạn được phép xem.</span>}
      {historyLoading && <span className="subtle">Đang tải lịch...</span>}
    </form>
  );

  const renderMeetings = (items: Meeting[], showPagination = false) => (
    <>
      <MeetingList meetings={items} onChanged={loadMeetings} currentUserEmail={activeUser.email} canManageAll={activeRole === "admin"} focusMeetingId={focusedMeetingId} onFocusHandled={() => setFocusedMeetingId(null)} />
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
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {!sidebarCollapsed && <button className="sidebar-backdrop" type="button" aria-label="Đóng thanh điều hướng" onClick={() => setSidebarCollapsed(true)} />}
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/assets/ICTU.png" alt="ICTU" />
          <div><strong>Meeting Management</strong><small>Hệ thống lịch họp</small></div>
        </div>
        <nav className="side-nav">
          <button className={page === "overview" ? "active" : ""} title="Tổng quan" aria-current={page === "overview" ? "page" : undefined} onClick={() => goTo("overview")}><span className="nav-icon">⌂</span><span className="nav-label">Tổng quan</span></button>
          {activeRole !== "participant" && <button className={page === "create" ? "active" : ""} title="Tạo lịch họp" aria-current={page === "create" ? "page" : undefined} onClick={() => goTo("create")}><span className="nav-icon">＋</span><span className="nav-label">Tạo lịch họp</span></button>}
          <button className={page === "calendar" ? "active" : ""} title="Lịch họp" aria-current={page === "calendar" ? "page" : undefined} onClick={() => goTo("calendar")}><span className="nav-icon nav-icon-indicator">▣{hasNewMeetings && <span className="nav-dot" aria-label="Có lịch họp mới" />}</span><span className="nav-label">Lịch họp</span></button>
          <button className={page === "notifications" ? "active" : ""} title="Thông báo" aria-current={page === "notifications" ? "page" : undefined} onClick={() => goTo("notifications")}><span className="nav-icon nav-icon-indicator">♢{unreadNotificationCount > 0 && <span className="nav-dot" aria-label="Có thông báo mới" />}</span><span className="nav-label">Thông báo</span></button>
          <button className={page === "rooms" ? "active" : ""} title="Phòng họp" aria-current={page === "rooms" ? "page" : undefined} onClick={() => goTo("rooms")}><span className="nav-icon">⌗</span><span className="nav-label">Phòng họp</span></button>
          <button className={page === "equipment" ? "active" : ""} title="Thiết bị" aria-current={page === "equipment" ? "page" : undefined} onClick={() => goTo("equipment")}><span className="nav-icon">⚙</span><span className="nav-label">Thiết bị</span></button>
          {activeRole === "admin" && <button className={page === "admin" ? "active" : ""} title="Quản trị" aria-current={page === "admin" ? "page" : undefined} onClick={() => goTo("admin")}><span className="nav-icon">♜</span><span className="nav-label">Quản trị</span></button>}
        </nav>
        <div className="sidebar-footer-actions">
          <InstallAppButton location="sidebar" />
          <button className="sidebar-logout" type="button" onClick={() => void onLogout()} title="Đăng xuất"><span className="nav-icon">↪</span><span className="sidebar-toggle-label">Đăng xuất</span></button>
          <button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            <span className="nav-icon">{sidebarCollapsed ? "›" : "‹"}</span><span className="sidebar-toggle-label">{sidebarCollapsed ? "Mở rộng" : "Thu gọn"}</span>
          </button>
        </div>
      </aside>
      <div className="app-content">
      <header className="ictu-header">
        <div className="ictu-brand">
          <img className="ictu-logo" src="/assets/ICTU.png" alt="Logo Trường Đại học Công nghệ Thông tin và Truyền thông" />
          <div>
            <strong>HỆ THỐNG QUẢN LÝ LỊCH HỌP</strong>
            <span>Trường Đại học Công nghệ Thông tin và Truyền thông</span>
          </div>
        </div>
        <div className="header-user">
          <button className="sidebar-reopen" type="button" aria-label="Mở thanh điều hướng" onClick={() => setSidebarCollapsed(false)}>☰</button>
          <div><strong>{activeUser.label}</strong><span>{activeUser.email} · {activeRole}</span></div>
          <button className="logout-button" type="button" onClick={() => void onLogout()}>Đăng xuất</button>
        </div>
      </header>
      <div className="welcome-bar" aria-label="Thông báo chào mừng">
        <div className="welcome-marquee">Chào mừng đến với hệ thống quản lý lịch họp ICTU</div>
      </div>
      {systemMessage && <div className="logout-notice" role="status">{systemMessage}</div>}
      <main>
        {page === "overview" && (
        <section className="hero">
          <div>
              <span className="eyebrow light">ICTU MEETING · SPRINT 3</span>
            <h1>Lịch họp rõ ràng,<br />phối hợp hiệu quả.</h1>
            <p>Quản lý lịch, thành viên và phòng họp trong một không gian thống nhất dành cho ICTU.</p>
          </div>
          <div className="stats">
            <div><strong>{scopedMeetings.length}</strong><span>Tổng lịch</span></div>
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
            <p className="subtle" style={{ gridColumn: "1 / -1", margin: 0 }}>{activeRole === "admin" ? "Góc nhìn quản trị · tổng hợp cuộc họp và tài nguyên toàn hệ thống." : "Góc nhìn nhân viên · thông báo và lịch liên quan đến tài khoản hiện tại."}</p>
            <div className="overview-card"><span>Cuộc họp hôm nay</span><strong>{todayMeetings}</strong><button onClick={() => goTo("calendar")}>Xem lịch →</button></div>
            <div className="overview-card"><span>Phòng đã đặt</span><strong>{booked}</strong><button onClick={() => goTo("rooms")}>Quản lý phòng →</button></div>
            <div className="overview-card"><span>Lời mời chờ phản hồi</span><strong>{pendingInvites}</strong><button onClick={showMyInvitations}>Xem lời mời →</button></div>
            <div className="overview-card"><span>Thông báo chưa đọc</span><strong>{unreadNotificationCount}</strong><button onClick={() => goTo("notifications")}>Quản lý thông báo →</button></div>
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
                  <span>{formatIctuDateTime(meeting.start_time)} · {meeting.booking?.room.name ?? "Chưa đặt phòng"}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {page === "overview" && <div className="page-layout"><GoogleCalendarPanel email={activeUser.email} /></div>}
        <div className="page-layout">
          {page === "create" && activeRole !== "participant" && <MeetingForm onCreated={loadMeetings} organizerEmail={activeUser.email} />}
          {page === "calendar" && <div className="content-column">{renderHistoryFilters()}{renderMeetings(pagedMeetings, true)}</div>}
          {page === "notifications" && <NotificationCenter email={activeUser.email} onOpenMeeting={openMeetingFromNotification} onUnreadCountChange={setUnreadNotificationCount} />}
          {page === "rooms" && <RoomDirectory meetings={meetings} />}
          {page === "equipment" && <EquipmentDirectory />}
          {page === "admin" && activeRole === "admin" && <AdminPanel adminEmail={activeUser.email} />}
        </div>
      </main>

      <footer>Meeting Management ICTU · Sprint 3 · Nhóm 4</footer>
      </div>
    </div>
  );
}
