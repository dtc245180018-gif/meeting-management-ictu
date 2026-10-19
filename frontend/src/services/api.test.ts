import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorMessage, authStorage } from "./api";


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
});
