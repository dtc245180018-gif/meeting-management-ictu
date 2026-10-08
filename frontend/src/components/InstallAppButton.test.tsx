import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallAppButton } from "./InstallAppButton";


describe("InstallAppButton", () => {
  it("opens the browser install prompt when the PWA is installable", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: typeof prompt;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    render(<InstallAppButton />);
    window.dispatchEvent(event);
    fireEvent.click(await screen.findByRole("button", { name: "Cài ứng dụng" }));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Đang hoàn tất cài đặt");
  });

  it("shows Chrome instructions when no install prompt is available", () => {
    render(<InstallAppButton />);
    fireEvent.click(screen.getByRole("button", { name: "Cài ứng dụng" }));
    expect(screen.getByRole("status")).toHaveTextContent("biểu tượng cài đặt");
  });

  it("removes the install action after the app is installed", async () => {
    render(<InstallAppButton location="header" />);
    expect(screen.getByRole("button", { name: "Tải ứng dụng" })).toBeInTheDocument();

    window.dispatchEvent(new Event("appinstalled"));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Tải ứng dụng" })).not.toBeInTheDocument());
    expect(screen.queryByText("Đã cài")).not.toBeInTheDocument();
  });
});
