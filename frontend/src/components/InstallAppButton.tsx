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


export function InstallAppButton({ location = "auth" }: { location?: "auth" | "sidebar" }) {
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
      setMessage("Trong Chrome, bấm biểu tượng cài đặt bên trái ngôi sao hoặc chọn ⋮ → Truyền, lưu và chia sẻ → Cài đặt trang dưới dạng ứng dụng.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted"
      ? "Đang hoàn tất cài đặt ứng dụng..."
      : "Bạn đã đóng hộp thoại cài đặt. Có thể bấm Cài ứng dụng để thử lại sau.");
  };

  return <div className={`pwa-install pwa-install-${location}`}>
    <button
      className="pwa-install-button"
      type="button"
      disabled={installed}
      title={installed ? "Ứng dụng đã được cài" : "Cài Meeting Management ICTU trên thiết bị"}
      onClick={() => void install()}
    >
      <span className="pwa-install-icon" aria-hidden="true">⇩</span>
      <span className="pwa-install-label">{installed ? "Đã cài ứng dụng" : "Cài ứng dụng"}</span>
    </button>
    {message && <span className="pwa-install-notice" role="status">{message}</span>}
  </div>;
}
