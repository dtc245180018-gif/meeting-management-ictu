import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { HrmIntegrationStatus, HrmSyncPage } from "../types";
import { formatIctuDateTime } from "../utils/dateTime";


export function HrmSyncPanel() {
  const [status, setStatus] = useState<HrmIntegrationStatus | null>(null);
  const [history, setHistory] = useState<HrmSyncPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextHistory] = await Promise.all([
        api.hrmStatus(),
        api.hrmHistory(page, 5, filter || undefined),
      ]);
      setStatus(nextStatus);
      setHistory(nextHistory);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải trạng thái HRM/ERP.");
    }
  }, [filter, page]);

  useEffect(() => { void load(); }, [load]);

  const sync = async (useInput: boolean) => {
    let records: Array<Record<string, unknown>> | undefined;
    if (useInput) {
      try {
        const parsed: unknown = JSON.parse(jsonInput);
        if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
          throw new Error("Dữ liệu phải là một mảng JSON gồm các nhân viên.");
        }
        records = parsed as Array<Record<string, unknown>>;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "JSON không hợp lệ.");
        return;
      }
    }
    setRunning(true);
    setMessage("");
    try {
      const result = await api.runHrmSync(records);
      setMessage(`Đồng bộ #${result.id}: tạo ${result.created_count}, cập nhật ${result.updated_count}, bỏ qua ${result.skipped_count}, lỗi ${result.failed_count}.`);
      setPage(1);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể chạy đồng bộ.");
    } finally {
      setRunning(false);
    }
  };

  return <div className="hrm-panel">
    <div className="integration-status">
      <div><span>Connector</span><strong>{status?.connector ?? "Đang kiểm tra..."}</strong></div>
      <div><span>Trạng thái</span><strong>{status?.configured ? "Sẵn sàng" : "Chưa cấu hình"}</strong></div>
      <div><span>Định kỳ</span><strong>{status?.periodic_enabled ? "Đã bật" : "Đang tắt"}</strong></div>
    </div>
    {status && <p className="subtle">{status.detail}</p>}
    <div className="hrm-actions">
      <button className="button primary" type="button" disabled={running || status?.running} onClick={() => void sync(false)}>{running ? "Đang đồng bộ..." : "Đồng bộ từ connector"}</button>
    </div>
    <details className="hrm-json-input">
      <summary>Nhập dữ liệu JSON thủ công để kiểm thử adapter</summary>
      <textarea value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} placeholder={'[{"external_id":"ICTU-001","full_name":"Nguyễn Văn A","email":"a@ictu.edu.vn","department":"CNTT","is_active":true}]'} />
      <button type="button" className="button secondary" disabled={running || !jsonInput.trim()} onClick={() => void sync(true)}>Đồng bộ JSON</button>
    </details>
    {message && <p className="notice" role="status">{message}</p>}

    <div className="section-heading compact-heading">
      <div><span className="eyebrow">AUDIT LOG</span><h3>Lịch sử đồng bộ</h3></div>
      <select aria-label="Lọc trạng thái đồng bộ" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
        <option value="">Tất cả</option>
        <option value="completed">Hoàn thành</option>
        <option value="completed_with_errors">Có lỗi dữ liệu</option>
        <option value="running">Đang chạy</option>
      </select>
    </div>
    <div className="hrm-history">
      {!history?.items.length && <p className="empty">Chưa có đợt đồng bộ nào.</p>}
      {history?.items.map((run) => <article key={run.id}>
        <div><strong>Đợt #{run.id} · {run.source}</strong><span>{formatIctuDateTime(run.started_at)} · {run.trigger}</span></div>
        <b>{run.status}</b>
        <p>Tổng {run.total_count} · Tạo {run.created_count} · Cập nhật {run.updated_count} · Bỏ qua {run.skipped_count} · Lỗi {run.failed_count}</p>
        {run.issues.length > 0 && <details><summary>{run.issues.length} lỗi dữ liệu</summary>{run.issues.map((issue) => <span key={issue.id}>{issue.record_key ?? "Không xác định"}: {issue.message}</span>)}</details>}
      </article>)}
    </div>
    {history && history.total_pages > 1 && <div className="pagination">
      <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
      <span>Trang {page} / {history.total_pages}</span>
      <button disabled={page >= history.total_pages} onClick={() => setPage((current) => current + 1)}>Sau</button>
    </div>}
  </div>;
}
