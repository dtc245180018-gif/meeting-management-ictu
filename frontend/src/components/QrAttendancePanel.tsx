import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import type { Account, BookingQr, BookingQrInspection, Meeting } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


interface Props {
  account: Account;
  meetings: Meeting[];
  autoStartScan?: boolean;
  onAutoStartConsumed?: () => void;
}


type QrScanner = import("html5-qrcode").Html5Qrcode;


function useRearCamera() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}


async function releaseScanner(scanner: QrScanner | null) {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch {
    // The browser can release a camera track before the library observes it.
  }
  try {
    scanner.clear();
  } catch {
    // The scanner element may already have been removed during navigation.
  }
}


export function QrAttendancePanel({ account, meetings, autoStartScan = false, onAutoStartConsumed }: Props) {
  const [qr, setQr] = useState<BookingQr | null>(null);
  const [token, setToken] = useState("");
  const [inspection, setInspection] = useState<BookingQrInspection | null>(null);
  const [mode, setMode] = useState<"scan" | "organize">("scan");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const scannerRef = useRef<QrScanner | null>(null);
  const scanSessionRef = useRef(0);
  const decodedRef = useRef(false);

  const managedMeetings = useMemo(() => meetings
    .filter((meeting) => meeting.status === "scheduled" && meeting.booking?.status === "active")
    .filter((meeting) => account.role === "admin" || meeting.organizer_email === account.email)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()),
  [account.email, account.role, meetings]);

  const stopScanner = useCallback(async () => {
    scanSessionRef.current += 1;
    const scanner = scannerRef.current;
    scannerRef.current = null;
    await releaseScanner(scanner);
    setScanning(false);
  }, []);

  const inspectValue = useCallback(async (value: string) => {
    if (!value.trim()) {
      setMessage("Hãy quét QR hoặc nhập mã dự phòng.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      setInspection(await api.inspectBookingQr(value.trim()));
    } catch (error) {
      setInspection(null);
      setMessage(error instanceof Error ? error.message : "Không thể kiểm tra mã QR.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  useEffect(() => {
    if (!autoStartScan) return;
    setMode("scan");
    setScanning(true);
    onAutoStartConsumed?.();
  }, [autoStartScan, onAutoStartConsumed]);

  useEffect(() => {
    if (!scanning) return;
    const session = scanSessionRef.current + 1;
    scanSessionRef.current = session;
    let active = true;
    const isActive = () => active && scanSessionRef.current === session;
    decodedRef.current = false;
    const scanConfig = { fps: 10, qrbox: { width: 240, height: 240 } };
    const handleDecoded = (decodedText: string) => {
      if (decodedRef.current) return;
      decodedRef.current = true;
      setToken(decodedText);
      setMessage("Đã đọc mã QR. Hãy kiểm tra thông tin trước khi xác nhận.");
      void stopScanner();
      void inspectValue(decodedText);
    };
    const handleCameraError = (error: unknown) => {
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          return "Bạn chưa cấp quyền camera. Hãy cho phép camera trong Safari hoặc Cài đặt iPhone.";
        }
        if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.";
        }
        if (error.name === "NotFoundError") {
          return "Không tìm thấy camera trên thiết bị.";
        }
      }
      return error instanceof Error && error.message
        ? error.message
        : "Không thể mở camera. Hãy cho phép quyền camera hoặc nhập mã dự phòng.";
    };
    const start = async () => {
      try {
        const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
        if (typeof window.isSecureContext === "boolean" && !window.isSecureContext && !localHostnames.has(window.location.hostname)) {
          throw new Error("Camera chỉ hoạt động trên HTTPS hoặc localhost.");
        }
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!isActive()) return;
        const initialScanner = new Html5Qrcode("qr-reader");
        scannerRef.current = initialScanner;
        try {
          const cameraMode: MediaTrackConstraints = useRearCamera()
            ? { facingMode: { exact: "environment" } }
            : { facingMode: "user" };
          await initialScanner.start(cameraMode, scanConfig, handleDecoded, () => undefined);
        } catch (initialError) {
          if (!isActive()) {
            await releaseScanner(initialScanner);
            return;
          }
          if (scannerRef.current === initialScanner) scannerRef.current = null;
          await releaseScanner(initialScanner);
          if (!isActive()) return;
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) throw new Error("Không tìm thấy camera trên thiết bị.", { cause: initialError });
          const rearCamera = cameras.find((camera) => /back|rear|environment|sau/i.test(camera.label));
          const mobile = useRearCamera();
          // Điện thoại ưu tiên camera sau; trình duyệt máy tính dùng webcam mặc định.
          const fallbackCamera = mobile ? rearCamera ?? cameras[cameras.length - 1] : cameras[0];
          if (mobile && !rearCamera) {
            setMessage("Không đọc được nhãn camera sau. Hệ thống đang thử camera cuối cùng của điện thoại.");
          }
          if (!isActive()) return;
          const fallbackScanner = new Html5Qrcode("qr-reader");
          scannerRef.current = fallbackScanner;
          try {
            await fallbackScanner.start(fallbackCamera.id, scanConfig, handleDecoded, () => undefined);
          } catch (fallbackError) {
            if (fallbackError instanceof Error || fallbackError instanceof DOMException) throw fallbackError;
            throw new Error("Không thể mở camera sau trên thiết bị.", { cause: fallbackError });
          }
        }
        if (!isActive()) {
          const scanner = scannerRef.current;
          scannerRef.current = null;
          await releaseScanner(scanner);
        }
      } catch (error) {
        if (isActive()) {
          const scanner = scannerRef.current;
          scannerRef.current = null;
          await releaseScanner(scanner);
          setMessage(handleCameraError(error));
          setScanning(false);
        }
      }
    };
    void start();
    return () => {
      active = false;
      if (scanSessionRef.current === session) scanSessionRef.current += 1;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      void releaseScanner(scanner);
    };
  }, [inspectValue, scanning, stopScanner]);

  const generate = async (bookingId: number) => {
    setLoading(true);
    setMessage("");
    try {
      setQr(await api.bookingQr(bookingId));
      setMessage("Đã tạo mã QR ký số. Mã chỉ dùng cho đúng phòng và lượt đặt này.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo mã QR.");
    } finally {
      setLoading(false);
    }
  };

  const record = async (action: "check-in" | "check-out") => {
    setLoading(true);
    setMessage("");
    try {
      const result = action === "check-in"
        ? await api.checkInBooking(token.trim())
        : await api.checkOutBooking(token.trim());
      setMessage(result.message);
      setInspection(await api.inspectBookingQr(token.trim()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể ghi nhận trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="module-page qr-attendance-page">
    <header className="module-page-heading">
      <div><span>Điểm danh cuộc họp</span><h1>Check-in bằng QR</h1><p>Quét mã tại phòng họp để ghi nhận thời gian đến và rời cuộc họp.</p></div>
      <div className="module-heading-status"><strong>{managedMeetings.length}</strong><span>lịch bạn quản lý</span></div>
    </header>
    <section className="module-summary-grid qr-summary-grid" aria-label="Hướng dẫn điểm danh">
      <article><span>Bước 1</span><strong>Mở camera</strong><small>Cho phép trình duyệt truy cập camera</small></article>
      <article><span>Bước 2</span><strong>Quét mã</strong><small>Đưa QR của phòng vào khung hình</small></article>
      <article><span>Bước 3</span><strong>Xác nhận</strong><small>Chọn check-in hoặc check-out</small></article>
    </section>
    <section className="module-surface qr-panel">
    <div className="module-section-heading"><div><span>Quét nhanh</span><h2>Điểm danh cuộc họp</h2></div><p>Hỗ trợ PWA trên điện thoại và trình duyệt máy tính.</p></div>
    <div className="qr-mode-switch" role="tablist" aria-label="Chế độ QR">
      <button className={mode === "scan" ? "active" : ""} type="button" onClick={() => setMode("scan")}><strong>Tôi tham dự</strong><span>Quét QR để điểm danh</span></button>
      <button className={mode === "organize" ? "active" : ""} type="button" onClick={() => { setMode("organize"); void stopScanner(); }}><strong>Tôi tổ chức</strong><span>Tạo QR cho cuộc họp</span></button>
    </div>

    {mode === "organize" && managedMeetings.length > 0 && <div className="qr-organizer-list">
      <h3>Mã QR cho cuộc họp bạn quản lý</h3>
      {managedMeetings.map((meeting) => <article key={meeting.id}>
        <div><strong>{meeting.title}</strong><span>{formatIctuDateTime(meeting.start_time)} · {meeting.booking?.room.name}</span></div>
        <button type="button" disabled={loading} onClick={() => void generate(meeting.booking!.id)}>Tạo QR</button>
      </article>)}
    </div>}

    {mode === "organize" && qr && <div className="qr-generated" aria-label="Mã QR đã tạo">
      <img src={qr.image_data_url} alt={`QR cho lượt đặt phòng ${qr.booking_id}`} />
      <div><strong>QR lượt đặt #{qr.booking_id}</strong><span>Hết hạn: {formatIctuDateTime(qr.expires_at)}</span><small>Không đăng mã này công khai. Người quét vẫn phải đăng nhập và thuộc cuộc họp.</small></div>
    </div>}

    {mode === "organize" && managedMeetings.length === 0 && <p className="empty">Bạn chưa có cuộc họp đã đặt phòng để tạo mã QR.</p>}

    {mode === "scan" && <div className="qr-scan-zone">
    <div className="qr-scan-zone-heading"><strong>Quét bằng camera</strong><span>Nếu camera không khả dụng, bạn có thể dùng mã dự phòng bên dưới.</span></div>
    <div className="qr-actions">
      <button type="button" className="button primary" onClick={() => setScanning(true)} disabled={scanning || loading}>{scanning ? "Đang mở camera..." : "Quét mã QR"}</button>
      {scanning && <button type="button" className="button secondary" onClick={() => void stopScanner()}>Dừng camera</button>}
    </div>
    {scanning && <div id="qr-reader" className="qr-reader" aria-label="Camera quét mã QR" />}

    <label className="qr-manual">Mã dự phòng
      <textarea value={token} onChange={(event) => { setToken(event.target.value); setInspection(null); }} placeholder="Dán chuỗi mã QR tại đây khi không dùng được camera" />
    </label>
      <button type="button" className="button secondary" disabled={loading} onClick={() => void inspectValue(token)}>{loading ? "Đang kiểm tra..." : "Kiểm tra mã"}</button>
    </div>}

    {mode === "scan" && inspection && <div className="qr-inspection">
      <strong>{inspection.meeting_title}</strong>
      <span>{inspection.room_name}</span>
      <span>{formatIctuDateTime(inspection.start_time)} – {formatIctuDateTime(inspection.end_time)}</span>
      {inspection.checked_in_at && <span>Đã check-in: {formatIctuDateTime(inspection.checked_in_at)}</span>}
      {inspection.checked_out_at && <span>Đã check-out: {formatIctuDateTime(inspection.checked_out_at)}</span>}
      <div>
        <button type="button" className="button primary" disabled={!inspection.can_check_in || loading} onClick={() => void record("check-in")}>Check-in</button>
        <button type="button" className="button secondary" disabled={!inspection.can_check_out || loading} onClick={() => void record("check-out")}>Check-out</button>
      </div>
    </div>}
    {message && <p className="notice" role="status">{message}</p>}
    </section>
  </div>;
}
