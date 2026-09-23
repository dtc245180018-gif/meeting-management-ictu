import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingList } from "./components/MeetingList";
import { api } from "./services/api";
import type { Meeting } from "./types";

export default function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filterEmail, setFilterEmail] = useState("");
  const [error, setError] = useState("");

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
    if (!email) return meetings;
    return meetings.filter(
      (meeting) => meeting.organizer_email === email || meeting.participants.some((person) => person.email === email),
    );
  }, [meetings, filterEmail]);

  const scheduled = meetings.filter((meeting) => meeting.status === "scheduled").length;
  const booked = meetings.filter((meeting) => meeting.booking?.status === "active").length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">M</div>
        <div>
          <strong>Meeting Management</strong>
          <span>ICTU · Nhóm 4</span>
        </div>
        <nav>
          <a href="#create">Tạo lịch</a>
          <a href="#meetings">Danh sách</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow light">SPRINT 1 · AGILE SCRUM</span>
            <h1>Tổ chức cuộc họp<br />nhanh và không trùng lịch.</h1>
            <p>Tạo lịch, mời thành viên, tìm giờ rảnh chung và đặt phòng trong một luồng thống nhất.</p>
          </div>
          <div className="stats">
            <div><strong>{meetings.length}</strong><span>Tổng lịch</span></div>
            <div><strong>{scheduled}</strong><span>Đang hoạt động</span></div>
            <div><strong>{booked}</strong><span>Đã có phòng</span></div>
          </div>
        </section>

        {error && <div className="error-banner">{error}. Hãy kiểm tra Backend tại cổng 8000.</div>}

        <div className="workspace">
          <div id="create"><MeetingForm onCreated={loadMeetings} /></div>
          <div id="meetings" className="content-column">
            <div className="filter-card">
              <div>
                <span className="eyebrow">US06 · Lịch sử cá nhân</span>
                <strong>Lọc theo email</strong>
              </div>
              <input type="email" value={filterEmail} onChange={(event) => setFilterEmail(event.target.value)} placeholder="member@ictu.edu.vn" />
            </div>
            <MeetingList meetings={visibleMeetings} onChanged={loadMeetings} />
          </div>
        </div>
      </main>

      <footer>Meeting Management ICTU · Sprint 1 · Nhóm 4</footer>
    </div>
  );
}

