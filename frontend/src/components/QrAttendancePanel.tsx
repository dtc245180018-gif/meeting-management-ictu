import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import type { Account, BookingQr, BookingQrInspection, Meeting } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


interface Props {
  account: Account;
  meetings: Meeting[];
}


export function QrAttendancePanel({ account, meetings }: Props) {
  const [qr, setQr] = useState<BookingQr | null>(null);
  const [token, setToken] = useState("");
  const [inspection, setInspection] = useState<BookingQrInspection | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const decodedRef = useRef(false);

  const managedMeetings = useMemo(() => meetings
    .filter((meeting) => meeting.status === "scheduled" && meeting.booking?.status === "active")
    .filter((meeting) => account.role === "admin" || meeting.organizer_email === account.email)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()),
  [account.email, account.role, meetings]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        // Camera may already have been released by the browser.
      }
    }
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
    if (!scanning) return;
    let active = true;
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
        const initialScanner = new Html5Qrcode("qr-reader");
        scannerRef.current = initialScanner;
        try {
          await initialScanner.start({ facingMode: "environment" }, scanConfig, handleDecoded, () => undefined);
        } catch {
          if (!active) return;
          await stopScanner();
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) throw new Error("Không tìm thấy camera trên thiết bị.");
          const rearCamera = cameras.find((camera) => /back|rear|environment|sau/i.test(camera.label));
          const fallbackCamera = rearCamera ?? cameras[0];
          if (!rearCamera) {
            setMessage("Không xác định được camera sau. Đang dùng camera khả dụng; bạn có thể dừng và thử lại.");
          }
          const fallbackScanner = new Html5Qrcode("qr-reader");
          scannerRef.current = fallbackScanner;
          await fallbackScanner.start(fallbackCamera.id, scanConfig, handleDecoded, () => undefined);
        }
        if (!active) await stopScanner();
      } catch (error) {
        if (active) {
          setMessage(handleCameraError(error));
          setScanning(false);
        }
      }
    };
    void start();
    return () => {
      active = false;
      void stopScanner();
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

  return <section className="card wide-card qr-panel">
    <div className="section-heading">
      <div><span className="eyebrow">US27 · QR ATTENDANCE</span><h2>Check-in / check-out phòng họp</h2></div>
      <span className="badge">PWA & Mobile</span>
    </div>
    <p className="subtle">Quét mã bằng camera trên HTTPS/localhost hoặc nhập mã dự phòng. Hệ thống xác minh người dùng, phòng và thời gian trước khi ghi nhận.</p>

    {managedMeetings.length > 0 && <div className="qr-organizer-list">
      <h3>Mã QR cho cuộc họp bạn quản lý</h3>
      {managedMeetings.map((meeting) => <article key={meeting.id}>
        <div><strong>{meeting.title}</strong><span>{formatIctuDateTime(meeting.start_time)} · {meeting.booking?.room.name}</span></div>
        <button type="button" disabled={loading} onClick={() => void generate(meeting.booking!.id)}>Tạo QR</button>
      </article>)}
    </div>}

    {qr && <div className="qr-generated" aria-label="Mã QR đã tạo">
      <img src={qr.image_data_url} alt={`QR cho lượt đặt phòng ${qr.booking_id}`} />
      <div><strong>QR lượt đặt #{qr.booking_id}</strong><span>Hết hạn: {formatIctuDateTime(qr.expires_at)}</span><small>Không đăng mã này công khai. Người quét vẫn phải đăng nhập và thuộc cuộc họp.</small></div>
    </div>}

    <div className="qr-actions">
      <button type="button" className="button primary" onClick={() => setScanning(true)} disabled={scanning || loading}>{scanning ? "Đang mở camera..." : "Quét mã QR"}</button>
      {scanning && <button type="button" className="button secondary" onClick={() => void stopScanner()}>Dừng camera</button>}
    </div>
    {scanning && <div id="qr-reader" className="qr-reader" aria-label="Camera quét mã QR" />}

    <label className="qr-manual">Mã dự phòng
      <textarea value={token} onChange={(event) => { setToken(event.target.value); setInspection(null); }} placeholder="Dán chuỗi mã QR tại đây khi không dùng được camera" />
    </label>
      <button type="button" className="button secondary" disabled={loading} onClick={() => void inspectValue(token)}>{loading ? "Đang kiểm tra..." : "Kiểm tra mã"}</button>

    {inspection && <div className="qr-inspection">
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
  </section>;
}
