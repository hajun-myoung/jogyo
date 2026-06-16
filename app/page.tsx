"use client";

import { FormEvent, useEffect, useState } from "react";

type ExamSettings = {
  title: string;
  endTime: string;
  notice: string;
};

type FullscreenStatus = "checking" | "supported" | "unsupported";

const DEFAULT_NOTICE = [
  "휴대전화 사용 금지",
  "답안지 이름과 학번을 확인하세요",
  "종료 후 감독 안내에 따라 제출하세요"
].join("\n");

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}

function toTimeInputValue(date: Date) {
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}`;
}

function createDefaultSettings(now = new Date()): ExamSettings {
  const defaultEnd = new Date(now.getTime() + 90 * 60 * 1000);

  return {
    title: "기말고사",
    endTime: toTimeInputValue(defaultEnd),
    notice: DEFAULT_NOTICE
  };
}

function formatClockTime(date: Date) {
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(
    date.getSeconds()
  )}`;
}

function formatDuration(totalMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(totalMilliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
}

function getTodayEndDate(endTime: string, now: Date) {
  const timeParts = endTime.split(":");

  if (timeParts.length !== 2) {
    return null;
  }

  const [hours, minutes] = timeParts.map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const endDate = new Date(now);
  endDate.setHours(hours, minutes, 0, 0);
  return endDate;
}

function getRemainingMilliseconds(endTime: string, now: Date) {
  const endDate = getTodayEndDate(endTime, now);

  if (!endDate) {
    return 0;
  }

  return Math.max(0, endDate.getTime() - now.getTime());
}

export default function ExamClockPage() {
  const [settings, setSettings] = useState<ExamSettings>({
    title: "기말고사",
    endTime: "",
    notice: DEFAULT_NOTICE
  });
  const [draftSettings, setDraftSettings] = useState<ExamSettings>({
    title: "기말고사",
    endTime: "",
    notice: DEFAULT_NOTICE
  });
  const [now, setNow] = useState<Date | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fullscreenStatus, setFullscreenStatus] =
    useState<FullscreenStatus>("checking");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const initialNow = new Date();
    const initialSettings = createDefaultSettings(initialNow);
    setNow(initialNow);
    setSettings(initialSettings);
    setDraftSettings(initialSettings);

    const tick = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const fullscreenEnabled =
      typeof document !== "undefined" &&
      Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);

    setFullscreenStatus(fullscreenEnabled ? "supported" : "unsupported");

    const handleFullscreenChange = () => {
      const nextIsFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(nextIsFullscreen);

      if (nextIsFullscreen) {
        setSetupOpen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const endDate = now ? getTodayEndDate(settings.endTime, now) : null;
  const remainingMilliseconds = now
    ? getRemainingMilliseconds(settings.endTime, now)
    : 0;
  const isEnded = Boolean(now && (!endDate || endDate.getTime() <= now.getTime()));

  const handleApplySettings = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!draftSettings.endTime) {
      setErrorMessage("종료 시각을 입력하세요.");
      setSetupOpen(true);
      return;
    }

    setSettings({
      title: draftSettings.title.trim() || "기말고사",
      endTime: draftSettings.endTime,
      notice: draftSettings.notice
    });
    setErrorMessage("");
    setHasStarted(true);
    setSetupOpen(false);
  };

  const handleToggleFullscreen = async () => {
    if (fullscreenStatus !== "supported") {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setErrorMessage("브라우저에서 전체화면 전환을 완료하지 못했습니다.");
    }
  };

  return (
    <main
      className={`min-h-dvh overflow-hidden text-white ${
        isEnded
          ? "bg-[radial-gradient(circle_at_top,#4c0519_0%,#111827_46%,#030712_100%)]"
          : "bg-[radial-gradient(circle_at_top,#0f766e_0%,#111827_42%,#030712_100%)]"
      }`}
    >
      <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-100/80">
              Jogyo Clock
            </p>
            <p className="mt-1 text-xs text-slate-300">
              clock.jogyo.web.app
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              aria-label={setupOpen ? "설정 패널 닫기" : "설정 패널 열기"}
              className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setSetupOpen((current) => !current)}
              disabled={isFullscreen}
            >
              {setupOpen ? "설정 닫기" : "설정 열기"}
            </button>
            <button
              type="button"
              aria-label={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
              className="rounded-md border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200"
              onClick={handleToggleFullscreen}
              disabled={fullscreenStatus !== "supported"}
            >
              {isFullscreen ? "전체화면 해제" : "전체화면"}
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 py-4 lg:grid-cols-[minmax(320px,400px),1fr] lg:gap-6">
          {setupOpen && !isFullscreen ? (
            <ExamSetupPanel
              settings={draftSettings}
              errorMessage={errorMessage}
              fullscreenStatus={fullscreenStatus}
              isFullscreen={isFullscreen}
              onSettingsChange={setDraftSettings}
              onSubmit={handleApplySettings}
              onToggleFullscreen={handleToggleFullscreen}
            />
          ) : null}

          <ClockDisplay
            settings={settings}
            now={now}
            remainingMilliseconds={remainingMilliseconds}
            isEnded={isEnded}
            hasStarted={hasStarted}
            className={setupOpen && !isFullscreen ? "" : "lg:col-span-2"}
          />
        </div>
      </div>
    </main>
  );
}

function ExamSetupPanel({
  settings,
  errorMessage,
  fullscreenStatus,
  isFullscreen,
  onSettingsChange,
  onSubmit,
  onToggleFullscreen
}: {
  settings: ExamSettings;
  errorMessage: string;
  fullscreenStatus: FullscreenStatus;
  isFullscreen: boolean;
  onSettingsChange: (settings: ExamSettings) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleFullscreen: () => void;
}) {
  const updateField = (field: keyof ExamSettings, value: string) => {
    onSettingsChange({
      ...settings,
      [field]: value
    });
  };

  return (
    <aside className="rounded-lg border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-5">
      <form className="flex h-full flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div>
          <h1 className="text-xl font-bold text-white">시험 시계 설정</h1>
          <p className="mt-1 text-sm text-slate-300">
            종료 시각은 오늘 날짜 기준으로 계산됩니다.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="exam-title"
            className="block text-sm font-semibold text-slate-100"
          >
            시험 제목
          </label>
          <input
            id="exam-title"
            type="text"
            value={settings.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-200 focus:ring-2 focus:ring-teal-200/30"
            placeholder="기말고사"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="exam-end-time"
            className="block text-sm font-semibold text-slate-100"
          >
            종료 시각
          </label>
          <input
            id="exam-end-time"
            type="time"
            value={settings.endTime}
            onChange={(event) => updateField("endTime", event.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-3 font-mono text-base tabular-nums text-white outline-none transition focus:border-teal-200 focus:ring-2 focus:ring-teal-200/30"
            required
          />
          {errorMessage ? (
            <p className="text-sm font-medium text-red-200">{errorMessage}</p>
          ) : null}
        </div>

        <div className="flex-1 space-y-2">
          <label
            htmlFor="exam-notice"
            className="block text-sm font-semibold text-slate-100"
          >
            주의사항
          </label>
          <textarea
            id="exam-notice"
            value={settings.notice}
            onChange={(event) => updateField("notice", event.target.value)}
            className="min-h-36 w-full resize-y rounded-md border border-white/10 bg-white/10 px-3 py-3 text-base leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-200 focus:ring-2 focus:ring-teal-200/30"
            placeholder="시험 중 안내할 내용을 입력하세요"
          />
        </div>

        {fullscreenStatus === "unsupported" ? (
          <p className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
            현재 브라우저는 전체화면 기능을 지원하지 않습니다.
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <button
            type="submit"
            aria-label="시계 시작"
            className="rounded-md bg-teal-300 px-4 py-3 text-base font-bold text-slate-950 transition hover:bg-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-100"
          >
            시계 시작
          </button>
          <button
            type="button"
            aria-label={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
            onClick={onToggleFullscreen}
            disabled={fullscreenStatus !== "supported"}
            className="rounded-md border border-white/15 bg-white/10 px-4 py-3 text-base font-bold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFullscreen ? "전체화면 해제" : "전체화면"}
          </button>
        </div>
      </form>
    </aside>
  );
}

function ClockDisplay({
  settings,
  now,
  remainingMilliseconds,
  isEnded,
  hasStarted,
  className = ""
}: {
  settings: ExamSettings;
  now: Date | null;
  remainingMilliseconds: number;
  isEnded: boolean;
  hasStarted: boolean;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-[calc(100dvh-8.5rem)] flex-col rounded-lg border border-white/10 bg-black/25 px-4 py-6 shadow-2xl shadow-black/20 sm:px-6 lg:px-10 ${className}`}
    >
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
          {hasStarted ? "시험 진행 중" : "대기 화면"}
        </p>
        <h2 className="mt-3 break-keep text-3xl font-black text-white sm:text-5xl lg:text-6xl">
          {settings.title}
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        {isEnded ? (
          <p className="mb-4 rounded-md bg-red-500/20 px-5 py-2 text-xl font-black text-red-100 ring-1 ring-red-300/30 sm:text-3xl">
            시험 종료
          </p>
        ) : null}
        <p
          aria-live="polite"
          className={`font-mono text-6xl font-black leading-none tabular-nums sm:text-8xl md:text-9xl lg:text-[10rem] xl:text-[12rem] ${
            isEnded ? "text-red-200" : "text-teal-100"
          }`}
        >
          {now ? formatDuration(remainingMilliseconds) : "--:--:--"}
        </p>
      </div>

      <div className="space-y-5">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow label="현재 시각" value={now ? formatClockTime(now) : "--:--:--"} />
          <InfoRow label="종료 시각" value={settings.endTime || "--:--"} />
        </div>

        {settings.notice.trim() ? (
          <div className="mx-auto max-w-5xl rounded-lg border border-white/10 bg-white/10 px-4 py-4 text-center text-lg font-semibold leading-8 text-slate-100 sm:text-2xl sm:leading-10">
            <p className="whitespace-pre-line break-keep">{settings.notice}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/60 px-4 py-3 text-center">
      <p className="text-sm font-semibold text-slate-300">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white sm:text-3xl">
        {value}
      </p>
    </div>
  );
}
