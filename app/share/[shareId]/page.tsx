"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getFirebaseServices } from "../../lib/firebase";
import {
  subscribeSharedClock,
  type SharedClock
} from "../../lib/shareStorage";
import { CLOCK_THEMES } from "../../lib/themes";

const MINUTE_MS = 60 * 1000;

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}

function formatClockTime(date: Date) {
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(
    date.getSeconds()
  )}`;
}

function formatTimeOnly(date: Date) {
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}`;
}

function formatDuration(totalMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(totalMilliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
}

function getViewerRemainingMs(sharedClock: SharedClock | null, nowMs: number) {
  if (!sharedClock) {
    return 0;
  }

  if (sharedClock.status === "paused" || sharedClock.isPaused) {
    return Math.max(0, sharedClock.pausedRemainingMs ?? 0);
  }

  if (sharedClock.status === "ended") {
    return 0;
  }

  return Math.max(0, sharedClock.endDateTime - nowMs);
}

function getViewerStatus(sharedClock: SharedClock | null, remainingMs: number) {
  if (!sharedClock) {
    return "loading";
  }

  if (sharedClock.status === "paused" || sharedClock.isPaused) {
    return "paused";
  }

  if (sharedClock.status === "ended" || remainingMs <= 0) {
    return "ended";
  }

  return "running";
}

export default function ShareViewerPage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId;
  const [sharedClock, setSharedClock] = useState<SharedClock | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const services = getFirebaseServices();

    if (services.status === "disabled") {
      setErrorMessage("Firebase 설정이 필요합니다.");
      setIsLoading(false);
      return;
    }

    const unsubscribe = subscribeSharedClock({
      db: services.db,
      shareId,
      onNext: (nextSharedClock) => {
        setSharedClock(nextSharedClock);
        setIsLoading(false);

        if (!nextSharedClock || !nextSharedClock.isPublic) {
          setErrorMessage("공유 시계를 찾을 수 없거나 공개가 중지되었습니다.");
          return;
        }

        if (nextSharedClock.expiresAt && nextSharedClock.expiresAt <= Date.now()) {
          setErrorMessage("공유 시계가 만료되었습니다.");
          return;
        }

        setErrorMessage("");
      },
      onError: () => {
        setErrorMessage("공유 시계를 불러오지 못했습니다.");
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [shareId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const visibleClock =
    sharedClock &&
    sharedClock.isPublic &&
    (!sharedClock.expiresAt || sharedClock.expiresAt > nowMs)
      ? sharedClock
      : null;
  const theme = CLOCK_THEMES[visibleClock?.themeId ?? "defaultDark"];
  const remainingMs = getViewerRemainingMs(visibleClock, nowMs);
  const status = getViewerStatus(visibleClock, remainingMs);
  const pageClassName =
    status === "ended"
      ? "bg-[radial-gradient(circle_at_top,#5f0718_0%,#111827_44%,#030712_100%)] text-white"
      : status === "paused"
        ? "bg-[radial-gradient(circle_at_top,#854d0e_0%,#111827_44%,#030712_100%)] text-white"
        : theme.pageClassName;

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setErrorMessage("전체화면 전환을 완료하지 못했습니다.");
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-white">
        <p className="text-xl font-bold">공유 시계를 불러오는 중입니다...</p>
      </main>
    );
  }

  if (errorMessage || !visibleClock) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div>
          <p className="text-2xl font-black">
            {errorMessage || "공유 시계를 표시할 수 없습니다."}
          </p>
          <p className="mt-3 text-sm text-slate-300">
            링크가 올바른지, 공유가 중지되지 않았는지 확인하세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-dvh overflow-hidden ${pageClassName}`}>
      <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {visibleClock.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visibleClock.logoDataUrl}
                alt={`${visibleClock.organizationName || "기관"} 로고`}
                className="h-10 max-w-24 rounded-md object-contain sm:h-14 sm:max-w-36"
              />
            ) : null}
            <div className="min-w-0">
              <p
                className={`truncate text-sm font-semibold uppercase tracking-[0.24em] sm:text-base ${theme.accentClassName}`}
              >
                {visibleClock.organizationName || "Jogyo Clock"}
              </p>
              {visibleClock.roomName ? (
                <p className={`mt-1 text-sm font-semibold ${theme.mutedTextClassName}`}>
                  {visibleClock.roomName}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
            onClick={handleToggleFullscreen}
            className="rounded-md border border-current/15 bg-current/10 px-3 py-2 text-sm font-bold transition hover:bg-current/15 focus:outline-none focus:ring-2 focus:ring-teal-200"
          >
            {isFullscreen ? "화면 해제" : "전체화면"}
          </button>
        </header>

        <section
          className={`mt-4 flex flex-1 flex-col rounded-lg border px-4 py-6 shadow-2xl sm:px-8 lg:px-12 ${theme.clockPanelClassName}`}
        >
          <div className="text-center">
            <p
              className={`text-sm font-semibold uppercase tracking-[0.24em] ${
                status === "paused"
                  ? "text-amber-200"
                  : status === "ended"
                    ? "text-red-200"
                    : theme.mutedTextClassName
              }`}
            >
              {status === "paused"
                ? "일시정지 중"
                : status === "ended"
                  ? "시험 종료"
                  : "시험 진행 중"}
            </p>
            <h1 className={`mt-3 break-keep text-3xl font-black sm:text-5xl lg:text-6xl ${theme.primaryTextClassName}`}>
              {visibleClock.examTitle}
            </h1>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            {status === "paused" ? (
              <p className="mb-4 rounded-md bg-amber-400/20 px-5 py-2 text-xl font-black text-amber-100 ring-1 ring-amber-300/30 sm:text-3xl">
                일시정지 중
              </p>
            ) : null}
            {status === "ended" ? (
              <div className="mb-4 space-y-2">
                <p className="rounded-md bg-red-500/20 px-5 py-2 text-xl font-black text-red-100 ring-1 ring-red-300/30 sm:text-3xl">
                  시험 종료
                </p>
                <p className="text-2xl font-black text-red-50 sm:text-4xl">
                  답안을 제출해주세요
                </p>
              </div>
            ) : null}
            <p
              aria-live="polite"
              className={`font-mono text-6xl font-black leading-none tabular-nums sm:text-8xl md:text-9xl lg:text-[10rem] xl:text-[12rem] ${
                status === "ended"
                  ? "text-red-200"
                  : status === "paused"
                    ? "text-amber-100"
                    : theme.accentClassName
              }`}
            >
              {formatDuration(remainingMs)}
            </p>
          </div>

          <div className="space-y-5">
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoRow label="현재 시각" value={formatClockTime(new Date(nowMs))} />
              <InfoRow
                label="종료 시각"
                value={formatTimeOnly(new Date(visibleClock.endDateTime || nowMs + MINUTE_MS))}
              />
            </div>
            {visibleClock.instructions.trim() ? (
              <div className="mx-auto max-w-5xl rounded-lg border border-current/10 bg-current/10 px-4 py-4 text-center text-lg font-semibold leading-8 sm:text-2xl sm:leading-10">
                <p className={`whitespace-pre-line break-keep ${theme.secondaryTextClassName}`}>
                  {visibleClock.instructions}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-current/10 bg-current/10 px-4 py-3 text-center">
      <p className="text-sm font-semibold opacity-75">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl">
        {value}
      </p>
    </div>
  );
}
