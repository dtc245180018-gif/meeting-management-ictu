import { useEffect, useState } from "react";


interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}


function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || navigatorWithStandalone.standalone === true;
}


function isIosDevice() {
  const appleMobileUserAgent = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const ipadUsingDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return appleMobileUserAgent || ipadUsingDesktopMode;
}


export function InstallAppButton({ location = "auth" }: { location?: "auth" | "sidebar" | "header" }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneMode);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage("");
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Đã cài Meeting Management ICTU thành ứng dụng.");
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) return;
    if (!installPrompt) {
      setMessage(isIosDevice()
        ? "Trên iPhone/iPad: mở trang bằng Safari, chạm Chia sẻ, chọn Thêm vào Màn hình chính rồi xác nhận Thêm."
        : "Trong Chrome, bấm biểu tượng cài đặt bên trái ngôi sao hoặc chọn ⋮ → Truyền, lưu và chia sẻ → Cài đặt trang dưới dạng ứng dụng.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted"
      ? "Đang hoàn tất cài đặt ứng dụng..."
      : "Bạn đã đóng hộp thoại cài đặt. Có thể bấm Cài ứng dụng để thử lại sau.");
  };

  if (installed) return null;

  return <div className={`pwa-install pwa-install-${location}`}>
    <button
      className="pwa-install-button"
      type="button"
      title="Cài Meeting Management ICTU trên thiết bị"
      onClick={() => void install()}
    >
      {location === "header" ? <svg className="app-store-icon" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="6" />
        <path d="M9 19.5 14 10l5 9.5M11.2 16h5.6M11.3 8.2l1.1 2M16.7 8.2l-1.1 2M7.5 19.5h2M18.5 19.5h2" />
      </svg> : <span className="pwa-install-icon" aria-hidden="true">⇩</span>}
      <span className="pwa-install-label">{location === "header" ? "Tải ứng dụng" : "Cài ứng dụng"}</span>
    </button>
    {message && <span className="pwa-install-notice" role="status">{message}</span>}
  </div>;
}
