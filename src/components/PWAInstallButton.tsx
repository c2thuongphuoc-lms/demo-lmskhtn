import React, { useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full' | 'header';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already installed and running as standalone app, hide button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (isInstallable) {
      const ok = await install();
      if (ok) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 4000);
      }
    } else {
      // If beforeinstallprompt hasn't fired yet or browser doesn't support it directly,
      // show guide modal
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {installSuccess ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 text-white rounded-xl text-xs font-bold animate-fade-in shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Đã cài đặt App!</span>
        </div>
      ) : variant === 'header' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`px-2.5 sm:px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border border-amber-400 ${className}`}
          title="Cài đặt App LMS Khoa học tự nhiên về điện thoại"
        >
          <Smartphone className="w-3.5 h-3.5 text-slate-950" />
          <span className="hidden sm:inline">Cài App Mobile</span>
          <span className="sm:hidden">Cài App</span>
        </button>
      ) : variant === 'full' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-98 text-slate-950 font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer ${className}`}
        >
          <Smartphone className="w-4 h-4 text-slate-950" />
          <span>Cài đặt Ứng dụng về Điện thoại</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-amber-300 font-bold text-xs rounded-lg transition-all cursor-pointer border border-amber-400/40 ${className}`}
          title="Cài đặt ứng dụng về màn hình chính"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Cài App</span>
        </button>
      )}

      {/* Modal hướng dẫn cài đặt cho iOS / trình duyệt khác */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white text-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm sm:text-base">
                  Cài đặt App trên Điện thoại
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 text-xs sm:text-sm space-y-3.5">
              <p className="text-slate-600">
                Để cài đặt biểu tượng <strong>LMS Khoa học tự nhiên</strong> ra màn hình chính và mở toàn màn hình như ứng dụng gốc:
              </p>

              {isIOS ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <span>Dành cho iPhone / iPad (Safari):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">1.</span>
                      <span>
                        Nhấn vào nút <strong>Chia sẻ</strong> (<Share className="w-3.5 h-3.5 inline text-blue-600 mx-0.5" />) ở thanh công cụ phía dưới Safari.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">2.</span>
                      <span>
                        Cuộn xuống và chọn <strong>"Thêm vào MH chính"</strong> (<PlusSquare className="w-3.5 h-3.5 inline text-slate-700 mx-0.5" /> <em>Add to Home Screen</em>).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">3.</span>
                      <span>
                        Nhấn <strong>"Thêm" (Add)</strong> ở góc trên bên phải. Ứng dụng sẽ xuất hiện ngay trên màn hình chính!
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <span>Dành cho Android (Chrome / Cốc Cốc):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">1.</span>
                      <span>
                        Nhấn vào biểu tượng <strong>3 dấu chấm (⋮)</strong> ở góc trên bên phải trình duyệt.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">2.</span>
                      <span>
                        Chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính"</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-blue-700 shrink-0">3.</span>
                      <span>
                        Xác nhận <strong>Cài đặt</strong>. App sẽ xuất hiện trên màn hình điện thoại.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-center"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
