import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { RoomDirectory } from "./components/RoomDirectory";
import { EquipmentDirectory } from "./components/EquipmentDirectory";
import { AdminPanel } from "./components/AdminPanel";
import { NotificationCenter } from "./components/NotificationCenter";
import { LoginPage } from "./components/LoginPage";
import { InstallAppButton } from "./components/InstallAppButton";
import { BookingChatbot } from "./components/BookingChatbot";
import { QrAttendancePanel } from "./components/QrAttendancePanel";
import { ProfilePage } from "./components/ProfilePage";
import { MeetingCalendar } from "./components/MeetingCalendar";
import { api, authStorage } from "./services/api";
import type { Account, Employee, Meeting } from "./types";
import { filterMeetings } from "./utils/meetingFilters";
import { loadAllHistory } from "./utils/historyPagination";
import { formatIctuDate, formatIctuTime } from "./utils/dateTime";
import { countPendingInvitations, scopeDashboardMeetings } from "./utils/dashboard";

type Page = "overview" | "create" | "calendar" | "notifications" | "rooms" | "equipment" | "qr" | "profile" | "admin";

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

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function QrScanIcon() {
  return <svg className="qr-scan-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    <path d="M8 8h3v3H8zM14 8h2v2h-2zM8 14h2v2H8zM13 13h3v3h-3z" />
    <path className="qr-scan-line" d="M6 12h12" />
  </svg>;
}

function LiveDateTime() {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const date = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(currentTime);
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(currentTime);

  return <div className="live-date-time" aria-live="off">
    <span className="live-status-dot" aria-hidden="true" />
    <span className="live-date">{date.charAt(0).toUpperCase() + date.slice(1)}</span>
    <strong>{time}</strong>
  </div>;
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
  return <AuthenticatedApp account={account} onAccountUpdated={setAccount} onLogout={logout} />;
}


function AuthenticatedApp({ account, onAccountUpdated, onLogout }: { account: Account; onAccountUpdated: (account: Account) => void; onLogout: () => Promise<void> }) {
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
  const [quickQrRequested, setQuickQrRequested] = useState(false);
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

  const openQuickQr = () => {
    setQuickQrRequested(isMobileDevice());
    goTo("qr");
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

  const renderMeetings = (items: Meeting[], showPagination = false, allowFocus = true) => (
    <>
      <MeetingList meetings={items} onChanged={loadMeetings} currentUserEmail={activeUser.email} canManageAll={activeRole === "admin"} focusMeetingId={allowFocus ? focusedMeetingId : null} onFocusHandled={allowFocus ? () => setFocusedMeetingId(null) : undefined} />
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
          <button className={page === "qr" ? "active" : ""} title="Check-in QR" aria-current={page === "qr" ? "page" : undefined} onClick={() => goTo("qr")}><span className="nav-icon"><QrScanIcon /></span><span className="nav-label">Check-in QR</span></button>
          <button className={page === "profile" ? "active" : ""} title="Tài khoản cá nhân" aria-current={page === "profile" ? "page" : undefined} onClick={() => goTo("profile")}><span className="nav-icon">●</span><span className="nav-label">Tài khoản cá nhân</span></button>
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
          <button className="header-qr-button" type="button" onClick={openQuickQr} title={isMobileDevice() ? "Mở camera quét QR" : "Mở trang quét QR"}><QrScanIcon /><b>Quét QR</b></button>
          <button className="header-avatar-button" type="button" onClick={() => goTo("profile")} title="Mở trang cá nhân" aria-label={`Trang cá nhân của ${activeUser.label}`}>{activeUser.label.trim().charAt(0).toUpperCase()}</button>
          <button className="logout-button" type="button" onClick={() => void onLogout()}>Đăng xuất</button>
        </div>
      </header>
      <div className="welcome-bar" aria-label="Thông báo chào mừng">
        <div className="welcome-marquee">Chào mừng đến với hệ thống quản lý lịch họp ICTU</div>
      </div>
      {systemMessage && <div className="logout-notice" role="status">{systemMessage}</div>}
      <main>
        {page === "overview" && (
        <section className="overview-hero" aria-labelledby="overview-title">
          <div className="overview-hero-copy">
            <span className="overview-kicker">Không gian làm việc ICTU</span>
            <h1 id="overview-title">Tổng quan</h1>
            <LiveDateTime />
            <p>Xin chào <strong>{activeUser.label}</strong>. Theo dõi lịch họp và xử lý công việc trong ngày tại một nơi.</p>
            <div className="overview-hero-actions">
              {activeRole !== "participant" ? (
                <button className="dashboard-button primary" type="button" onClick={() => goTo("create")}><span>＋</span>Tạo lịch họp</button>
              ) : (
                <button className="dashboard-button primary" type="button" onClick={() => goTo("calendar")}><span>▣</span>Xem lịch họp</button>
              )}
              <button className="dashboard-button secondary" type="button" onClick={() => goTo("rooms")}><span>⌗</span>Tìm phòng</button>
            </div>
          </div>
          <div className="overview-hero-visual" aria-hidden="true">
            <div className="overview-logo-orbit"><img src="/assets/ICTU.png" alt="" /></div>
            <span className="visual-card card-one">Lịch</span>
            <span className="visual-card card-two">Phòng</span>
            <span className="visual-card card-three">ICTU</span>
          </div>
        </section>
        )}

        {error && <div className="error-banner">{error}. Hãy kiểm tra Backend tại cổng 8000.</div>}

        {page === "overview" && (
          <section className="overview-summary" aria-labelledby="overview-summary-title">
            <div className="overview-section-heading">
              <div><span>Hoạt động hôm nay</span><h2 id="overview-summary-title">Thông tin cần chú ý</h2></div>
              <p>{activeRole === "admin" ? "Dữ liệu toàn hệ thống" : "Dữ liệu liên quan đến tài khoản của bạn"}</p>
            </div>
            <div className="overview-metrics">
              <article className="metric-card metric-blue">
                <div className="metric-card-top"><span>Cuộc họp hôm nay</span><b aria-hidden="true">▣</b></div>
                <strong>{todayMeetings}</strong>
                <small>{scheduled} cuộc họp sắp diễn ra</small>
                <button type="button" onClick={() => goTo("calendar")}>Xem lịch <span>→</span></button>
              </article>
              <article className="metric-card metric-orange">
                <div className="metric-card-top"><span>Phòng đã đặt</span><b aria-hidden="true">⌗</b></div>
                <strong>{booked}</strong>
                <small>{withoutRoom} lịch chưa có phòng</small>
                <button type="button" onClick={() => goTo("rooms")}>Xem phòng <span>→</span></button>
              </article>
              <article className="metric-card metric-green">
                <div className="metric-card-top"><span>Lời mời chờ phản hồi</span><b aria-hidden="true">✓</b></div>
                <strong>{pendingInvites}</strong>
                <small>Cần xác nhận tham dự</small>
                <button type="button" onClick={showMyInvitations}>Xem lời mời <span>→</span></button>
              </article>
              <article className="metric-card metric-navy">
                <div className="metric-card-top"><span>Thông báo chưa đọc</span><b aria-hidden="true">♢</b></div>
                <strong>{unreadNotificationCount}</strong>
                <small>{scopedMeetings.length} lịch trong hệ thống</small>
                <button type="button" onClick={() => goTo("notifications")}>Mở thông báo <span>→</span></button>
              </article>
            </div>
          </section>
        )}
        {page === "overview" && (
          <section className="card recent-meetings" aria-labelledby="recent-meetings-title">
            <div className="section-heading">
              <div><span className="eyebrow">Lịch làm việc</span><h2 id="recent-meetings-title">Cuộc họp sắp diễn ra</h2></div>
              <button className="dashboard-button compact secondary" onClick={() => goTo("calendar")}>Xem tất cả <span>→</span></button>
            </div>
            <div className="recent-list">
              {recentMeetings.length === 0 && <p className="empty">Chưa có cuộc họp nào.</p>}
              {recentMeetings.map((meeting) => (
                <div className="recent-item" key={meeting.id}>
                  <div className="recent-date"><strong>{formatIctuDate(meeting.start_time).split("/")[0]}</strong><span>Tháng {formatIctuDate(meeting.start_time).split("/")[1]}</span></div>
                  <div className="recent-copy"><strong>{meeting.title}</strong><span>{formatIctuTime(meeting.start_time)} – {formatIctuTime(meeting.end_time)} · {meeting.organizer_email}</span></div>
                  <span className={`recent-room ${meeting.booking ? "booked" : "pending"}`}>{meeting.booking?.room.name ?? "Chưa có phòng"}</span>
                  <button type="button" onClick={() => openMeetingFromNotification(meeting.id)}>Chi tiết</button>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="page-layout">
          {page === "create" && activeRole !== "participant" && <MeetingForm onCreated={loadMeetings} organizerEmail={activeUser.email} />}
          {page === "calendar" && <MeetingCalendar
            meetings={visibleMeetings}
            account={account}
            onChanged={loadMeetings}
            focusMeetingId={focusedMeetingId}
            onFocusHandled={() => setFocusedMeetingId(null)}
            advancedContent={<>{renderHistoryFilters()}{renderMeetings(pagedMeetings, true, false)}</>}
          />}
          {page === "notifications" && <NotificationCenter email={activeUser.email} onOpenMeeting={openMeetingFromNotification} onUnreadCountChange={setUnreadNotificationCount} />}
          {page === "rooms" && <RoomDirectory meetings={meetings} />}
          {page === "equipment" && <EquipmentDirectory />}
          {page === "qr" && <QrAttendancePanel account={account} meetings={meetings} autoStartScan={quickQrRequested} onAutoStartConsumed={() => setQuickQrRequested(false)} />}
          {page === "profile" && <ProfilePage account={account} onUpdated={onAccountUpdated} onLogout={onLogout} />}
          {page === "admin" && activeRole === "admin" && <AdminPanel adminEmail={activeUser.email} />}
        </div>
      </main>

      <footer>© 2026 Meeting Management ICTU · Phát triển bởi Nguyễn Ngọc Thắng</footer>
      </div>
      <BookingChatbot
        organizerEmail={activeUser.email}
        organizerName={activeUser.label}
        canBook={activeRole === "admin" || activeRole === "organizer"}
        onCreated={loadMeetings}
        onViewMeetings={() => goTo("calendar")}
      />
    </div>
  );
}
