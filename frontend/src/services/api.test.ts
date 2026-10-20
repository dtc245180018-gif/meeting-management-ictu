import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorMessage, authStorage, downloadAuthenticated } from "./api";


describe("API error handling", () => {
  beforeEach(() => {
    authStorage.clear();
    vi.restoreAllMocks();
  });

  it("turns FastAPI validation objects into a readable Vietnamese message", () => {
    expect(apiErrorMessage({
      detail: [{
        type: "value_error",
        loc: ["body", "email"],
        msg: "value is not a valid email address",
      }],
    })).toBe("Email không đúng định dạng.");
  });

  it("preserves a string error returned by the backend", () => {
    expect(apiErrorMessage({ detail: "Email hoặc mật khẩu không đúng" }))
      .toBe("Email hoặc mật khẩu không đúng");
  });

  it("does not announce an expired session for a failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ detail: "Email hoặc mật khẩu không đúng" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ));
    const expired = vi.fn();
    window.addEventListener("ictu-auth-expired", expired);

    await expect(api.login("user@ictu.edu.vn", "wrong"))
      .rejects.toThrow("Email hoặc mật khẩu không đúng");
    expect(expired).not.toHaveBeenCalled();

    window.removeEventListener("ictu-auth-expired", expired);
  });

  it("keeps an exported Blob alive until the browser has started the download", async () => {
    vi.useFakeTimers();
    authStorage.set("report-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      new Blob(["report-bytes"]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="ictu-report.pdf"',
        },
      },
    ));
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ictu-report");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await downloadAuthenticated("/api/admin/reports/export?format=pdf");

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="ictu-report.pdf"]')).not.toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.querySelector('a[download="ictu-report.pdf"]')).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:ictu-report");
    vi.useRealTimers();
  });
});
