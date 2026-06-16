"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ExamSettings = {
  title: string;
  endTime: string;
  notice: string;
};

type FullscreenStatus = "checking" | "supported" | "unsupported";
type NoticeTone = "info" | "warning" | "danger";

type Notice = {
  message: string;
  detail?: string;
  tone?: NoticeTone;
};

const DEFAULT_NOTICE = [
  "휴대전화 사용 금지",
  "답안지 이름과 학번을 확인하세요",
  "종료 후 감독 안내에 따라 제출하세요"
].join("\n");

const MINUTE_MS = 60 * 1000;
const NOTICE_TIMEOUT_MS = 4000;

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

function formatCompactDuration(totalMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(totalMilliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}분 ${padTime(seconds)}초`;
  }

  return `${seconds}초`;
}

function createDefaultSettings(nowMs = Date.now()): ExamSettings {
  const defaultEnd = new Date(nowMs + 90 * MINUTE_MS);

  return {
    title: "기말고사",
    endTime: formatTimeOnly(defaultEnd),
    notice: DEFAULT_NOTICE
  };
}

function parseTodayEndDateTime(endTime: string, nowMs: number) {
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

  const endDate = new Date(nowMs);
  endDate.setHours(hours, minutes, 0, 0);
  return endDate.getTime();
}

function getRemainingMs({
  endDateTime,
  nowMs,
  isPaused,
  pausedRemainingMs
}: {
  endDateTime: number | null;
  nowMs: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
}) {
  if (isPaused && pausedRemainingMs !== null) {
    return Math.max(0, pausedRemainingMs);
  }

  if (endDateTime === null || nowMs === null) {
    return 0;
  }

  return Math.max(0, endDateTime - nowMs);
}

function isFormField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function ExamClockPage() {
  const [examTitle, setExamTitle] = useState("기말고사");
  const [instructions, setInstructions] = useState(DEFAULT_NOTICE);
  const [endDateTime, setEndDateTime] = useState<number | null>(null);
  const [draftSettings, setDraftSettings] = useState<ExamSettings>({
    title: "기말고사",
    endTime: "",
    notice: DEFAULT_NOTICE
  });
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [fullscreenStatus, setFullscreenStatus] =
    useState<FullscreenStatus>("checking");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const showNotice = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
  }, []);

  useEffect(() => {
    const initialNow = Date.now();
    const initialSettings = createDefaultSettings(initialNow);
    const initialEndDateTime = parseTodayEndDateTime(
      initialSettings.endTime,
      initialNow
    );

    setNowMs(initialNow);
    setExamTitle(initialSettings.title);
    setInstructions(initialSettings.notice);
    setEndDateTime(initialEndDateTime);
    setDraftSettings(initialSettings);

    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, NOTICE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  useEffect(() => {
    const fullscreenEnabled = Boolean(
      document.fullscreenEnabled && document.documentElement.requestFullscreen
    );

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

  const remainingMs = getRemainingMs({
    endDateTime,
    nowMs,
    isPaused,
    pausedRemainingMs
  });
  const isEnded = Boolean(
    !isPaused &&
      nowMs !== null &&
      endDateTime !== null &&
      endDateTime <= nowMs
  );
  const currentStatus = isPaused
    ? "paused"
    : isEnded
      ? "ended"
      : isStarted
        ? "running"
        : "waiting";

  const applyEndDateTime = useCallback((nextEndDateTime: number | null) => {
    setEndDateTime(nextEndDateTime);

    if (nextEndDateTime !== null) {
      setDraftSettings((current) => ({
        ...current,
        endTime: formatTimeOnly(new Date(nextEndDateTime))
      }));
    }
  }, []);

  const addMinutesToEnd = useCallback(
    (minutes: number) => {
      const currentNowMs = Date.now();
      const deltaMs = minutes * MINUTE_MS;
      const endedNow =
        !isPaused && endDateTime !== null && endDateTime <= currentNowMs;
      const baseEndDateTime =
        endedNow && minutes > 0 ? currentNowMs : endDateTime ?? currentNowMs;
      const nextEndDateTime = baseEndDateTime + deltaMs;

      applyEndDateTime(nextEndDateTime);

      if (isPaused) {
        setPausedRemainingMs((currentPausedRemainingMs) =>
          Math.max(0, (currentPausedRemainingMs ?? remainingMs) + deltaMs)
        );
      }

      setIsStarted(true);
      showNotice({
        message:
          minutes > 0
            ? `+${minutes}분 연장되었습니다`
            : `${minutes}분 단축되었습니다`,
        detail: `종료 시각: ${formatTimeOnly(new Date(nextEndDateTime))}`,
        tone: minutes > 0 ? "info" : "warning"
      });
    },
    [applyEndDateTime, endDateTime, isPaused, remainingMs, showNotice]
  );

  const togglePause = useCallback(() => {
    const currentNowMs = Date.now();

    if (!isPaused) {
      const nextPausedRemainingMs = getRemainingMs({
        endDateTime,
        nowMs: currentNowMs,
        isPaused: false,
        pausedRemainingMs: null
      });

      setIsPaused(true);
      setPausedAt(currentNowMs);
      setPausedRemainingMs(nextPausedRemainingMs);
      setIsStarted(true);
      showNotice({
        message: "시험이 일시정지되었습니다",
        detail: `남은 시간: ${formatDuration(nextPausedRemainingMs)}`,
        tone: "warning"
      });
      return;
    }

    const pausedElapsedMs = pausedAt ? currentNowMs - pausedAt : 0;
    const nextEndDateTime =
      endDateTime !== null
        ? endDateTime + pausedElapsedMs
        : currentNowMs + (pausedRemainingMs ?? 0);

    applyEndDateTime(nextEndDateTime);
    setIsPaused(false);
    setPausedAt(null);
    setPausedRemainingMs(null);
    setIsStarted(true);
    showNotice({
      message: "시험이 재개되었습니다",
      detail: `정지된 ${formatCompactDuration(
        pausedElapsedMs
      )}만큼 종료 시각이 연장되었습니다`,
      tone: "info"
    });
  }, [
    applyEndDateTime,
    endDateTime,
    isPaused,
    pausedAt,
    pausedRemainingMs,
    showNotice
  ]);

  const endExamNow = useCallback(() => {
    const currentNowMs = Date.now();
    applyEndDateTime(currentNowMs);
    setIsPaused(false);
    setPausedAt(null);
    setPausedRemainingMs(null);
    setIsStarted(true);
    showNotice({
      message: "시험이 종료되었습니다",
      detail: "답안을 제출해주세요",
      tone: "danger"
    });
  }, [applyEndDateTime, showNotice]);

  const handleToggleFullscreen = useCallback(async () => {
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
      showNotice({
        message: "전체화면 전환을 완료하지 못했습니다",
        detail: "브라우저 권한이나 실행 환경을 확인하세요",
        tone: "warning"
      });
    }
  }, [fullscreenStatus, showNotice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePause();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        addMinutesToEnd(event.shiftKey ? 5 : 1);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        addMinutesToEnd(event.shiftKey || event.key === "_" ? -5 : -1);
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        endExamNow();
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void handleToggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMinutesToEnd, endExamNow, handleToggleFullscreen, togglePause]);

  const handleApplySettings = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const currentNowMs = Date.now();

    if (!draftSettings.endTime) {
      setErrorMessage("종료 시각을 입력하세요.");
      setSetupOpen(true);
      return;
    }

    const nextEndDateTime = parseTodayEndDateTime(
      draftSettings.endTime,
      currentNowMs
    );

    if (nextEndDateTime === null) {
      setErrorMessage("올바른 종료 시각을 입력하세요.");
      setSetupOpen(true);
      return;
    }

    setExamTitle(draftSettings.title.trim() || "기말고사");
    setInstructions(draftSettings.notice);
    applyEndDateTime(nextEndDateTime);
    setErrorMessage("");
    setIsStarted(true);
    setIsPaused(false);
    setPausedAt(null);
    setPausedRemainingMs(null);
    setSetupOpen(false);
    showNotice({
      message: "시험 시계가 적용되었습니다",
      detail: `종료 시각: ${formatTimeOnly(new Date(nextEndDateTime))}`,
      tone: nextEndDateTime <= currentNowMs ? "danger" : "info"
    });
  };

  return (
    <main
      className={`min-h-dvh overflow-hidden text-white ${
        currentStatus === "ended"
          ? "bg-[radial-gradient(circle_at_top,#5f0718_0%,#111827_44%,#030712_100%)]"
          : currentStatus === "paused"
            ? "bg-[radial-gradient(circle_at_top,#854d0e_0%,#111827_44%,#030712_100%)]"
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

        <NoticeBanner notice={notice} />

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
            examTitle={examTitle}
            instructions={instructions}
            nowMs={nowMs}
            endDateTime={endDateTime}
            remainingMs={remainingMs}
            status={currentStatus}
            className={setupOpen && !isFullscreen ? "" : "lg:col-span-2"}
          />
        </div>
      </div>

      <SupervisorControls
        isPaused={isPaused}
        fullscreenStatus={fullscreenStatus}
        isFullscreen={isFullscreen}
        shortcutHelpOpen={shortcutHelpOpen}
        onAdjust={addMinutesToEnd}
        onTogglePause={togglePause}
        onEndNow={endExamNow}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleHelp={() => setShortcutHelpOpen((current) => !current)}
      />
    </main>
  );
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  const toneClassName =
    notice.tone === "danger"
      ? "border-red-300/40 bg-red-500/20 text-red-50"
      : notice.tone === "warning"
        ? "border-amber-300/40 bg-amber-400/20 text-amber-50"
        : "border-teal-200/40 bg-teal-300/15 text-teal-50";

  return (
    <div className="pointer-events-none fixed left-1/2 top-5 z-40 w-[min(calc(100%-2rem),720px)] -translate-x-1/2 px-1">
      <div
        className={`rounded-lg border px-4 py-3 text-center shadow-2xl shadow-black/30 backdrop-blur ${toneClassName}`}
        role="status"
      >
        <p className="text-base font-black sm:text-xl">{notice.message}</p>
        {notice.detail ? (
          <p className="mt-1 text-sm font-semibold opacity-90 sm:text-base">
            {notice.detail}
          </p>
        ) : null}
      </div>
    </div>
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
  examTitle,
  instructions,
  nowMs,
  endDateTime,
  remainingMs,
  status,
  className = ""
}: {
  examTitle: string;
  instructions: string;
  nowMs: number | null;
  endDateTime: number | null;
  remainingMs: number;
  status: "waiting" | "running" | "paused" | "ended";
  className?: string;
}) {
  const statusLabel =
    status === "paused"
      ? "일시정지 중"
      : status === "ended"
        ? "시험 종료"
        : status === "running"
          ? "시험 진행 중"
          : "대기 화면";

  return (
    <section
      className={`flex min-h-[calc(100dvh-8.5rem)] flex-col rounded-lg border border-white/10 bg-black/25 px-4 py-6 shadow-2xl shadow-black/20 sm:px-6 lg:px-10 ${className}`}
    >
      <div className="text-center">
        <p
          className={`text-sm font-semibold uppercase tracking-[0.24em] ${
            status === "paused"
              ? "text-amber-200"
              : status === "ended"
                ? "text-red-200"
                : "text-slate-300"
          }`}
        >
          {statusLabel}
        </p>
        <h2 className="mt-3 break-keep text-3xl font-black text-white sm:text-5xl lg:text-6xl">
          {examTitle}
        </h2>
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
                : "text-teal-100"
          }`}
        >
          {nowMs ? formatDuration(remainingMs) : "--:--:--"}
        </p>
      </div>

      <div className="space-y-5">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow
            label="현재 시각"
            value={nowMs ? formatClockTime(new Date(nowMs)) : "--:--:--"}
          />
          <InfoRow
            label="종료 시각"
            value={endDateTime ? formatTimeOnly(new Date(endDateTime)) : "--:--"}
          />
        </div>

        {instructions.trim() ? (
          <div className="mx-auto max-w-5xl rounded-lg border border-white/10 bg-white/10 px-4 py-4 text-center text-lg font-semibold leading-8 text-slate-100 sm:text-2xl sm:leading-10">
            <p className="whitespace-pre-line break-keep">{instructions}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SupervisorControls({
  isPaused,
  fullscreenStatus,
  isFullscreen,
  shortcutHelpOpen,
  onAdjust,
  onTogglePause,
  onEndNow,
  onToggleFullscreen,
  onToggleHelp
}: {
  isPaused: boolean;
  fullscreenStatus: FullscreenStatus;
  isFullscreen: boolean;
  shortcutHelpOpen: boolean;
  onAdjust: (minutes: number) => void;
  onTogglePause: () => void;
  onEndNow: () => void;
  onToggleFullscreen: () => void;
  onToggleHelp: () => void;
}) {
  return (
    <aside className="fixed bottom-4 right-4 z-30 w-[min(calc(100vw-2rem),360px)] rounded-lg border border-white/10 bg-slate-950/55 p-3 text-white shadow-2xl shadow-black/30 backdrop-blur transition hover:bg-slate-950/85 focus-within:bg-slate-950/90">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
          감독 컨트롤
        </p>
        <button
          type="button"
          aria-label="단축키 도움말 열기 또는 닫기"
          onClick={onToggleHelp}
          className="rounded-md border border-white/10 px-2 py-1 text-xs font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-200"
        >
          단축키
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <ControlButton label="+1분" ariaLabel="시험 시간 1분 연장" onClick={() => onAdjust(1)} />
        <ControlButton label="+5분" ariaLabel="시험 시간 5분 연장" onClick={() => onAdjust(5)} />
        <ControlButton label="-1분" ariaLabel="시험 시간 1분 단축" onClick={() => onAdjust(-1)} />
        <ControlButton label="-5분" ariaLabel="시험 시간 5분 단축" onClick={() => onAdjust(-5)} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <ControlButton
          label={isPaused ? "재개" : "일시정지"}
          ariaLabel={isPaused ? "시험 재개" : "시험 일시정지"}
          onClick={onTogglePause}
          tone={isPaused ? "info" : "warning"}
        />
        <ControlButton
          label="즉시 종료"
          ariaLabel="시험 즉시 종료"
          onClick={onEndNow}
          tone="danger"
        />
        <ControlButton
          label={isFullscreen ? "화면 해제" : "전체화면"}
          ariaLabel={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
          onClick={onToggleFullscreen}
          disabled={fullscreenStatus !== "supported"}
        />
      </div>

      {shortcutHelpOpen ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
          <p>Space 일시정지/재개</p>
          <p>+ 또는 = +1분 / Shift++ +5분</p>
          <p>- -1분 / Shift+- -5분</p>
          <p>E 즉시 종료 / F 전체화면</p>
        </div>
      ) : null}
    </aside>
  );
}

function ControlButton({
  label,
  ariaLabel,
  onClick,
  tone = "default",
  disabled = false
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  tone?: "default" | "info" | "warning" | "danger";
  disabled?: boolean;
}) {
  const toneClassName =
    tone === "danger"
      ? "border-red-300/20 bg-red-500/20 text-red-50 hover:bg-red-500/30"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-400/20 text-amber-50 hover:bg-amber-400/30"
        : tone === "info"
          ? "border-teal-200/20 bg-teal-300/20 text-teal-50 hover:bg-teal-300/30"
          : "border-white/10 bg-white/10 text-white hover:bg-white/15";

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-md border px-2 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-45 ${toneClassName}`}
    >
      {label}
    </button>
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
