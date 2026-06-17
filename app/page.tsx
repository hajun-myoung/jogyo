"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import {
  CLOCK_THEMES,
  normalizeThemeId,
  type ClockTheme,
  type ThemeId,
} from "./lib/themes";
import {
  createPresetId,
  mergePresets,
  safeReadLastSettings,
  safeReadPresets,
  safeWriteLastSettings,
  safeWritePresets,
  type ClockPreset,
  type LastSettings,
} from "./lib/storage";
import { getFirebaseServices, type FirebaseServices } from "./lib/firebase";
import {
  loadCloudData,
  saveLastSettingsToCloud,
  savePresetsToCloud,
} from "./lib/cloudStorage";
import {
  createRoom,
  deleteRoom,
  listRooms,
  updateRoom,
  updateRoomCurrentShare,
  type Room,
} from "./lib/roomStorage";
import {
  createShareId,
  createSharedClock,
  stopSharedClock,
  updateSharedClock,
  type ShareStatus,
  type SharedClock,
} from "./lib/shareStorage";

type ExamSettings = {
  title: string;
  endTime: string;
  notice: string;
};

type FullscreenStatus = "checking" | "supported" | "unsupported";
type NoticeTone = "info" | "warning" | "danger";
type ClockStatus = "waiting" | "running" | "paused" | "ended";
type CloudAction =
  | "login"
  | "logout"
  | "saveSettings"
  | "savePresets"
  | "load"
  | null;
type ShareAction = "create" | "update" | "stop" | "copy" | null;
type RoomAction = "load" | "create" | "update" | "delete" | null;

type Notice = {
  message: string;
  detail?: string;
  tone?: NoticeTone;
};

const DEFAULT_NOTICE = [
  "휴대전화 사용 금지",
  "답안지 이름과 학번을 확인하세요",
  "종료 후 감독 안내에 따라 제출하세요",
].join("\n");

const DEFAULT_ORGANIZATION_NAME = "Jogyo Clock";
const MINUTE_MS = 60 * 1000;
const NOTICE_TIMEOUT_MS = 4000;
const LAST_SETTINGS_DEBOUNCE_MS = 500;
const LOGO_MAX_BYTES = 1024 * 1024;

type DefaultLogoPreset = {
  id: string;
  name: string;
  src: string;
};

const DEFAULT_LOGO_PRESETS: DefaultLogoPreset[] = [
  {
    id: "snu",
    name: "서울대",
    src: "/logos/snu.jpg",
  },
  {
    id: "korea",
    name: "고려대",
    src: "/logos/korea.png",
  },
  {
    id: "yonsei",
    name: "연세대",
    src: "/logos/yonsei.png",
  },
  {
    id: "kaist",
    name: "카이스트",
    src: "/logos/kaist.jpg",
  },
  {
    id: "postech",
    name: "포항공대",
    src: "/logos/postech.jpg",
  },
];

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}

function formatClockTime(date: Date) {
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(
    date.getSeconds(),
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

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp);
  return `${padTime(date.getMonth() + 1)}/${padTime(date.getDate())} ${padTime(
    date.getHours(),
  )}:${padTime(date.getMinutes())}`;
}

function createDefaultSettings(nowMs = Date.now()): ExamSettings {
  const defaultEnd = new Date(nowMs + 90 * MINUTE_MS);

  return {
    title: "기말고사",
    endTime: formatTimeOnly(defaultEnd),
    notice: DEFAULT_NOTICE,
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
  pausedRemainingMs,
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

function getLastSettingsFromDraft({
  draftSettings,
  themeId,
  organizationName,
  logoDataUrl,
}: {
  draftSettings: ExamSettings;
  themeId: ThemeId;
  organizationName: string;
  logoDataUrl: string | null;
}): LastSettings {
  return {
    examTitle: draftSettings.title.trim() || "기말고사",
    endTimeInput: draftSettings.endTime,
    instructions: draftSettings.notice,
    themeId,
    organizationName: organizationName.trim() || DEFAULT_ORGANIZATION_NAME,
    logoDataUrl,
  };
}

function getShortErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120);
  }

  return "잠시 후 다시 시도하세요";
}

function getPublicShareUrl(shareId: string) {
  if (typeof window === "undefined") {
    return `/share/${shareId}`;
  }

  return `${window.location.origin}/share/${shareId}`;
}

export default function ExamClockPage() {
  const [examTitle, setExamTitle] = useState("기말고사");
  const [instructions, setInstructions] = useState(DEFAULT_NOTICE);
  const [endDateTime, setEndDateTime] = useState<number | null>(null);
  const [draftSettings, setDraftSettings] = useState<ExamSettings>({
    title: "기말고사",
    endTime: "",
    notice: DEFAULT_NOTICE,
  });
  const [themeId, setThemeId] = useState<ThemeId>("defaultDark");
  const [organizationName, setOrganizationName] = useState(
    DEFAULT_ORGANIZATION_NAME,
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [presets, setPresets] = useState<ClockPreset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("기말고사");
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isShow, setIsShow] = useState(true);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [fullscreenStatus, setFullscreenStatus] =
    useState<FullscreenStatus>("checking");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [firebaseServices, setFirebaseServices] =
    useState<FirebaseServices | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudAction, setCloudAction] = useState<CloudAction>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [roomAction, setRoomAction] = useState<RoomAction>(null);
  const [activeSharedClock, setActiveSharedClock] =
    useState<SharedClock | null>(null);
  const [shareAction, setShareAction] = useState<ShareAction>(null);

  const theme = CLOCK_THEMES[themeId];

  const showNotice = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
  }, []);

  const applyEndDateTime = useCallback((nextEndDateTime: number | null) => {
    setEndDateTime(nextEndDateTime);

    if (nextEndDateTime !== null) {
      setDraftSettings((current) => ({
        ...current,
        endTime: formatTimeOnly(new Date(nextEndDateTime)),
      }));
    }
  }, []);

  const applyLoadedSettings = useCallback(
    (settings: LastSettings, options?: { presetId?: string | null }) => {
      const currentNowMs = Date.now();
      const fallbackSettings = createDefaultSettings(currentNowMs);
      const parsedEndDateTime = parseTodayEndDateTime(
        settings.endTimeInput,
        currentNowMs,
      );
      const nextEndDateTime =
        parsedEndDateTime ??
        parseTodayEndDateTime(fallbackSettings.endTime, currentNowMs);
      const nextDraftSettings = {
        title: settings.examTitle.trim() || "기말고사",
        endTime: parsedEndDateTime
          ? settings.endTimeInput
          : fallbackSettings.endTime,
        notice: settings.instructions,
      };

      setExamTitle(nextDraftSettings.title);
      setInstructions(nextDraftSettings.notice);
      setDraftSettings(nextDraftSettings);
      setPresetName(nextDraftSettings.title);
      setThemeId(normalizeThemeId(settings.themeId));
      setOrganizationName(
        settings.organizationName.trim() || DEFAULT_ORGANIZATION_NAME,
      );
      setLogoDataUrl(settings.logoDataUrl || null);
      setCurrentPresetId(options?.presetId ?? null);
      setEndDateTime(nextEndDateTime);
      setIsStarted(true);
      setIsPaused(false);
      setPausedAt(null);
      setPausedRemainingMs(null);

      if (!parsedEndDateTime) {
        showNotice({
          message: "종료 시각을 기본값으로 대체했습니다",
          detail: "불러온 설정의 종료 시각 형식이 올바르지 않습니다",
          tone: "warning",
        });
      }
    },
    [showNotice],
  );

  useEffect(() => {
    const initialNow = Date.now();
    const defaultSettings = createDefaultSettings(initialNow);
    const lastSettings = safeReadLastSettings();
    const initialSettings: LastSettings = lastSettings ?? {
      examTitle: defaultSettings.title,
      endTimeInput: defaultSettings.endTime,
      instructions: defaultSettings.notice,
      themeId: "defaultDark",
      organizationName: DEFAULT_ORGANIZATION_NAME,
      logoDataUrl: null,
    };
    const initialEndDateTime =
      parseTodayEndDateTime(initialSettings.endTimeInput, initialNow) ??
      parseTodayEndDateTime(defaultSettings.endTime, initialNow);

    setNowMs(initialNow);
    setExamTitle(initialSettings.examTitle);
    setInstructions(initialSettings.instructions);
    setEndDateTime(initialEndDateTime);
    setDraftSettings({
      title: initialSettings.examTitle,
      endTime: parseTodayEndDateTime(initialSettings.endTimeInput, initialNow)
        ? initialSettings.endTimeInput
        : defaultSettings.endTime,
      notice: initialSettings.instructions,
    });
    setThemeId(normalizeThemeId(initialSettings.themeId));
    setOrganizationName(
      initialSettings.organizationName.trim() || DEFAULT_ORGANIZATION_NAME,
    );
    setLogoDataUrl(initialSettings.logoDataUrl || null);
    setPresetName(initialSettings.examTitle || "기말고사");
    setPresets(safeReadPresets());
    setHasLoadedSettings(true);

    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const services = getFirebaseServices();
    setFirebaseServices(services);

    if (services.status === "disabled") {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(services.auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      setRooms([]);
      setSelectedRoomId("");
      setRoomNameInput("");
      setActiveSharedClock(null);
      return;
    }

    let isMounted = true;
    setRoomAction("load");

    listRooms({
      db: firebaseServices.db,
      uid: authUser.uid,
    })
      .then((nextRooms) => {
        if (!isMounted) {
          return;
        }

        setRooms(nextRooms);
        setSelectedRoomId((currentRoomId) =>
          currentRoomId && nextRooms.some((room) => room.id === currentRoomId)
            ? currentRoomId
            : (nextRooms[0]?.id ?? ""),
        );
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        showNotice({
          message: "강의실 목록을 불러오지 못했습니다",
          detail: getShortErrorMessage(error),
          tone: "warning",
        });
      })
      .finally(() => {
        if (isMounted) {
          setRoomAction(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authUser, firebaseServices, showNotice]);

  useEffect(() => {
    if (!hasLoadedSettings) {
      return;
    }

    const timeout = window.setTimeout(() => {
      safeWriteLastSettings(
        getLastSettingsFromDraft({
          draftSettings,
          themeId,
          organizationName,
          logoDataUrl,
        }),
      );
    }, LAST_SETTINGS_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    draftSettings,
    hasLoadedSettings,
    logoDataUrl,
    organizationName,
    themeId,
  ]);

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
      document.fullscreenEnabled && document.documentElement.requestFullscreen,
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
    pausedRemainingMs,
  });
  const isEnded = Boolean(
    !isPaused && nowMs !== null && endDateTime !== null && endDateTime <= nowMs,
  );
  const currentStatus: ClockStatus = isPaused
    ? "paused"
    : isEnded
      ? "ended"
      : isStarted
        ? "running"
        : "waiting";

  const addMinutesToEnd = useCallback(
    (minutes: number) => {
      const currentNowMs = Date.now();
      const deltaMs = minutes * MINUTE_MS;
      const endedNow =
        !isPaused && endDateTime !== null && endDateTime <= currentNowMs;
      const baseEndDateTime =
        endedNow && minutes > 0 ? currentNowMs : (endDateTime ?? currentNowMs);
      const nextEndDateTime = baseEndDateTime + deltaMs;

      applyEndDateTime(nextEndDateTime);

      if (isPaused) {
        setPausedRemainingMs((currentPausedRemainingMs) =>
          Math.max(0, (currentPausedRemainingMs ?? remainingMs) + deltaMs),
        );
      }

      setIsStarted(true);
      showNotice({
        message:
          minutes > 0
            ? `+${minutes}분 연장되었습니다`
            : `${minutes}분 단축되었습니다`,
        detail: `종료 시각: ${formatTimeOnly(new Date(nextEndDateTime))}`,
        tone: minutes > 0 ? "info" : "warning",
      });
    },
    [applyEndDateTime, endDateTime, isPaused, remainingMs, showNotice],
  );

  const togglePause = useCallback(() => {
    const currentNowMs = Date.now();

    if (!isPaused) {
      const nextPausedRemainingMs = getRemainingMs({
        endDateTime,
        nowMs: currentNowMs,
        isPaused: false,
        pausedRemainingMs: null,
      });

      setIsPaused(true);
      setPausedAt(currentNowMs);
      setPausedRemainingMs(nextPausedRemainingMs);
      setIsStarted(true);
      showNotice({
        message: "시험이 일시정지되었습니다",
        detail: `남은 시간: ${formatDuration(nextPausedRemainingMs)}`,
        tone: "warning",
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
        pausedElapsedMs,
      )}만큼 종료 시각이 연장되었습니다`,
      tone: "info",
    });
  }, [
    applyEndDateTime,
    endDateTime,
    isPaused,
    pausedAt,
    pausedRemainingMs,
    showNotice,
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
      tone: "danger",
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
        tone: "warning",
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
      currentNowMs,
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
      tone: nextEndDateTime <= currentNowMs ? "danger" : "info",
    });
  };

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      showNotice({
        message: "로고 파일은 1MB 이하만 사용할 수 있습니다",
        tone: "warning",
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoDataUrl(reader.result);
        showNotice({
          message: "로고가 적용되었습니다",
          tone: "info",
        });
        return;
      }

      showNotice({
        message: "로고 파일을 읽지 못했습니다",
        tone: "warning",
      });
    };

    reader.onerror = () => {
      showNotice({
        message: "로고 파일을 읽지 못했습니다",
        tone: "warning",
      });
    };

    reader.readAsDataURL(file);
  };

  const buildPreset = (presetId: string, createdAt: number): ClockPreset => {
    const savedSettings = getLastSettingsFromDraft({
      draftSettings,
      themeId,
      organizationName,
      logoDataUrl,
    });
    const timestamp = Date.now();

    return {
      id: presetId,
      name: presetName.trim() || savedSettings.examTitle,
      examTitle: savedSettings.examTitle,
      endTimeInput: savedSettings.endTimeInput,
      instructions: savedSettings.instructions,
      themeId: savedSettings.themeId,
      organizationName: savedSettings.organizationName,
      logoDataUrl: savedSettings.logoDataUrl,
      createdAt,
      updatedAt: timestamp,
    };
  };

  const commitPresets = (nextPresets: ClockPreset[]) => {
    const sortedPresets = [...nextPresets].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    setPresets(sortedPresets);
    safeWritePresets(sortedPresets);
  };

  const getCurrentLastSettings = () =>
    getLastSettingsFromDraft({
      draftSettings,
      themeId,
      organizationName,
      logoDataUrl,
    });

  const handleSaveAsPreset = () => {
    const presetId = createPresetId();
    const timestamp = Date.now();
    const nextPreset = buildPreset(presetId, timestamp);
    commitPresets([nextPreset, ...presets]);
    setCurrentPresetId(presetId);
    setPresetName(nextPreset.name);
    showNotice({
      message: "프리셋이 저장되었습니다",
      detail: nextPreset.name,
      tone: "info",
    });
  };

  const handleUpdatePreset = () => {
    if (!currentPresetId) {
      handleSaveAsPreset();
      return;
    }

    const currentPreset = presets.find(
      (preset) => preset.id === currentPresetId,
    );
    const nextPreset = buildPreset(
      currentPresetId,
      currentPreset?.createdAt ?? Date.now(),
    );

    commitPresets(
      presets.map((preset) =>
        preset.id === currentPresetId ? nextPreset : preset,
      ),
    );
    setPresetName(nextPreset.name);
    showNotice({
      message: "프리셋이 업데이트되었습니다",
      detail: nextPreset.name,
      tone: "info",
    });
  };

  const handleLoadPreset = (preset: ClockPreset) => {
    applyLoadedSettings(
      {
        examTitle: preset.examTitle,
        endTimeInput: preset.endTimeInput,
        instructions: preset.instructions,
        themeId: preset.themeId,
        organizationName: preset.organizationName,
        logoDataUrl: preset.logoDataUrl ?? null,
      },
      { presetId: preset.id },
    );
    setPresetName(preset.name);
    showNotice({
      message: "프리셋을 불러왔습니다",
      detail: "기존 진행 상태가 불러온 설정으로 변경되었습니다",
      tone: "info",
    });
  };

  const handleDeletePreset = (preset: ClockPreset) => {
    if (!window.confirm(`'${preset.name}' 프리셋을 삭제할까요?`)) {
      return;
    }

    const nextPresets = presets.filter((item) => item.id !== preset.id);
    commitPresets(nextPresets);

    if (currentPresetId === preset.id) {
      setCurrentPresetId(null);
    }

    showNotice({
      message: "프리셋이 삭제되었습니다",
      detail: preset.name,
      tone: "warning",
    });
  };

  const getSelectedRoom = () =>
    rooms.find((room) => room.id === selectedRoomId) ?? null;

  const getShareStatus = (): ShareStatus => {
    if (currentStatus === "paused") {
      return "paused";
    }

    if (currentStatus === "ended") {
      return "ended";
    }

    return "running";
  };

  const buildSharedClock = (
    shareId: string,
    createdAt: number,
  ): SharedClock => {
    const selectedRoom = getSelectedRoom();
    const timestamp = Date.now();

    return {
      id: shareId,
      ownerUid: authUser?.uid ?? "",
      roomId: selectedRoom?.id ?? null,
      roomName: selectedRoom?.name ?? "",
      examTitle: examTitle.trim() || "기말고사",
      endDateTime: endDateTime ?? timestamp,
      endTimeInput: draftSettings.endTime,
      instructions,
      themeId,
      organizationName: organizationName.trim() || DEFAULT_ORGANIZATION_NAME,
      logoDataUrl: logoDataUrl || null,
      isPaused,
      pausedRemainingMs: isPaused ? remainingMs : null,
      status: getShareStatus(),
      isPublic: true,
      createdAt,
      updatedAt: timestamp,
      expiresAt: null,
    };
  };

  const handleCreateRoom = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    const roomName = roomNameInput.trim();

    if (!roomName) {
      showNotice({
        message: "강의실 이름을 입력하세요",
        tone: "warning",
      });
      return;
    }

    setRoomAction("create");

    try {
      const room = await createRoom({
        db: firebaseServices.db,
        uid: authUser.uid,
        name: roomName,
      });
      setRooms((currentRooms) => [room, ...currentRooms]);
      setSelectedRoomId(room.id);
      setRoomNameInput("");
      showNotice({
        message: "강의실이 생성되었습니다",
        detail: room.name,
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "강의실 생성에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setRoomAction(null);
    }
  };

  const handleRenameRoom = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    const selectedRoom = getSelectedRoom();
    const roomName = roomNameInput.trim();

    if (!selectedRoom || !roomName) {
      showNotice({
        message: "수정할 강의실과 이름을 확인하세요",
        tone: "warning",
      });
      return;
    }

    setRoomAction("update");

    try {
      const nextRoom = await updateRoom({
        db: firebaseServices.db,
        uid: authUser.uid,
        room: {
          ...selectedRoom,
          name: roomName,
        },
      });
      setRooms((currentRooms) =>
        currentRooms
          .map((room) => (room.id === nextRoom.id ? nextRoom : room))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
      setRoomNameInput("");
      showNotice({
        message: "강의실 이름이 수정되었습니다",
        detail: nextRoom.name,
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "강의실 수정에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setRoomAction(null);
    }
  };

  const handleDeleteRoom = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    const selectedRoom = getSelectedRoom();

    if (!selectedRoom) {
      return;
    }

    if (!window.confirm(`'${selectedRoom.name}' 강의실을 삭제할까요?`)) {
      return;
    }

    setRoomAction("delete");

    try {
      await deleteRoom({
        db: firebaseServices.db,
        uid: authUser.uid,
        roomId: selectedRoom.id,
      });
      const nextRooms = rooms.filter((room) => room.id !== selectedRoom.id);
      setRooms(nextRooms);
      setSelectedRoomId(nextRooms[0]?.id ?? "");
      setRoomNameInput("");
      showNotice({
        message: "강의실이 삭제되었습니다",
        detail: selectedRoom.name,
        tone: "warning",
      });
    } catch (error) {
      showNotice({
        message: "강의실 삭제에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setRoomAction(null);
    }
  };

  const handleCreateShare = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    const shareId = createShareId();
    const timestamp = Date.now();
    const sharedClock = buildSharedClock(shareId, timestamp);
    setShareAction("create");

    try {
      await createSharedClock({
        db: firebaseServices.db,
        sharedClock,
      });

      if (sharedClock.roomId) {
        await updateRoomCurrentShare({
          db: firebaseServices.db,
          uid: authUser.uid,
          roomId: sharedClock.roomId,
          shareId,
        });
      }

      setActiveSharedClock(sharedClock);
      setRooms((currentRooms) =>
        currentRooms.map((room) =>
          room.id === sharedClock.roomId
            ? { ...room, currentShareId: shareId, updatedAt: Date.now() }
            : room,
        ),
      );
      showNotice({
        message: "공유 링크가 생성되었습니다",
        detail: getPublicShareUrl(shareId),
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "공유 링크 생성에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setShareAction(null);
    }
  };

  const handleUpdateShare = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser ||
      !activeSharedClock
    ) {
      return;
    }

    const sharedClock = buildSharedClock(
      activeSharedClock.id,
      activeSharedClock.createdAt,
    );
    setShareAction("update");

    try {
      await updateSharedClock({
        db: firebaseServices.db,
        sharedClock,
      });
      setActiveSharedClock(sharedClock);
      showNotice({
        message: "공유 시계가 업데이트되었습니다",
        detail: `마지막 업데이트: ${formatClockTime(new Date(sharedClock.updatedAt))}`,
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "공유 시계 업데이트에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setShareAction(null);
    }
  };

  const handleStopShare = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !activeSharedClock
    ) {
      return;
    }

    setShareAction("stop");

    try {
      await stopSharedClock({
        db: firebaseServices.db,
        shareId: activeSharedClock.id,
      });
      setActiveSharedClock({
        ...activeSharedClock,
        isPublic: false,
        updatedAt: Date.now(),
      });
      showNotice({
        message: "공유가 중지되었습니다",
        tone: "warning",
      });
    } catch (error) {
      showNotice({
        message: "공유 중지에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setShareAction(null);
    }
  };

  const handleCopyShareLink = async () => {
    if (!activeSharedClock) {
      return;
    }

    setShareAction("copy");

    try {
      await navigator.clipboard.writeText(
        getPublicShareUrl(activeSharedClock.id),
      );
      showNotice({
        message: "공유 링크가 복사되었습니다",
        tone: "info",
      });
    } catch {
      showNotice({
        message: "공유 링크 복사에 실패했습니다",
        detail: "표시된 링크를 직접 복사하세요",
        tone: "warning",
      });
    } finally {
      setShareAction(null);
    }
  };

  const handleGoogleLogin = async () => {
    if (!firebaseServices || firebaseServices.status === "disabled") {
      showNotice({
        message: "Firebase 환경변수가 설정되지 않았습니다",
        detail: "로컬 모드는 계속 사용할 수 있습니다",
        tone: "warning",
      });
      return;
    }

    setCloudAction("login");

    try {
      await signInWithPopup(firebaseServices.auth, firebaseServices.provider);
      showNotice({
        message: "로그인되었습니다",
        detail: "클라우드 저장과 불러오기를 사용할 수 있습니다",
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "로그인에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setCloudAction(null);
    }
  };

  const handleLogout = async () => {
    if (!firebaseServices || firebaseServices.status === "disabled") {
      return;
    }

    setCloudAction("logout");

    try {
      await signOut(firebaseServices.auth);
      showNotice({
        message: "로그아웃되었습니다",
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "로그아웃에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setCloudAction(null);
    }
  };

  const handleSaveCurrentSettingsToCloud = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    setCloudAction("saveSettings");

    try {
      await saveLastSettingsToCloud({
        db: firebaseServices.db,
        uid: authUser.uid,
        settings: getCurrentLastSettings(),
      });
      showNotice({
        message: "클라우드에 저장되었습니다",
        detail: "현재 설정을 저장했습니다",
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "클라우드 저장에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setCloudAction(null);
    }
  };

  const handleSavePresetsToCloud = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    setCloudAction("savePresets");

    try {
      await savePresetsToCloud({
        db: firebaseServices.db,
        uid: authUser.uid,
        presets,
      });
      showNotice({
        message: "클라우드에 저장되었습니다",
        detail: "로컬 프리셋을 저장했습니다",
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "클라우드 저장에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setCloudAction(null);
    }
  };

  const handleLoadFromCloud = async () => {
    if (
      !firebaseServices ||
      firebaseServices.status === "disabled" ||
      !authUser
    ) {
      return;
    }

    setCloudAction("load");

    try {
      const cloudData = await loadCloudData({
        db: firebaseServices.db,
        uid: authUser.uid,
      });
      const mergedPresets = mergePresets(presets, cloudData.presets);

      if (cloudData.lastSettings) {
        applyLoadedSettings(cloudData.lastSettings);
      }

      commitPresets(mergedPresets);
      showNotice({
        message: "클라우드 설정을 불러왔습니다",
        detail: `${cloudData.presets.length}개 프리셋을 병합했습니다`,
        tone: "info",
      });
    } catch (error) {
      showNotice({
        message: "클라우드 불러오기에 실패했습니다",
        detail: getShortErrorMessage(error),
        tone: "warning",
      });
    } finally {
      setCloudAction(null);
    }
  };

  const pageClassName =
    currentStatus === "ended"
      ? "bg-[radial-gradient(circle_at_top,#5f0718_0%,#111827_44%,#030712_100%)] text-white"
      : currentStatus === "paused"
        ? "bg-[radial-gradient(circle_at_top,#854d0e_0%,#111827_44%,#030712_100%)] text-white"
        : theme.pageClassName;

  return (
    <main className={`min-h-dvh overflow-hidden ${pageClassName}`}>
      <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <BrandMark
            organizationName={organizationName}
            logoDataUrl={logoDataUrl}
            theme={theme}
          />

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              aria-label={setupOpen ? "설정 패널 닫기" : "설정 패널 열기"}
              className="rounded-md border border-current/15 bg-current/10 px-3 py-2 text-sm font-semibold transition hover:bg-current/15 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setSetupOpen((current) => !current)}
              disabled={isFullscreen}
            >
              {setupOpen ? "설정 닫기" : "설정 열기"}
            </button>
            <button
              type="button"
              aria-label={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200 ${theme.buttonClassName}`}
              onClick={handleToggleFullscreen}
              disabled={fullscreenStatus !== "supported"}
            >
              {isFullscreen ? "전체화면 해제" : "전체화면"}
            </button>
          </div>
        </header>

        <NoticeBanner notice={notice} />

        <div className="grid flex-1 grid-cols-1 gap-4 py-4 lg:grid-cols-[minmax(340px,430px),1fr] lg:gap-6">
          {setupOpen && !isFullscreen ? (
            <ExamSetupPanel
              settings={draftSettings}
              errorMessage={errorMessage}
              fullscreenStatus={fullscreenStatus}
              isFullscreen={isFullscreen}
              theme={theme}
              themeId={themeId}
              organizationName={organizationName}
              logoDataUrl={logoDataUrl}
              presetName={presetName}
              currentPresetId={currentPresetId}
              presets={presets}
              firebaseServices={firebaseServices}
              authUser={authUser}
              authReady={authReady}
              cloudAction={cloudAction}
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              roomNameInput={roomNameInput}
              roomAction={roomAction}
              activeSharedClock={activeSharedClock}
              shareAction={shareAction}
              onSettingsChange={setDraftSettings}
              onThemeChange={setThemeId}
              onOrganizationNameChange={setOrganizationName}
              onLogoUpload={handleLogoUpload}
              onDefaultLogoSelect={(preset) => {
                setLogoDataUrl(preset.src);
                showNotice({
                  message: "기본 로고가 적용되었습니다",
                  detail: preset.name,
                  tone: "info",
                });
              }}
              onLogoDelete={() => {
                setLogoDataUrl(null);
                showNotice({
                  message: "로고가 삭제되었습니다",
                  tone: "warning",
                });
              }}
              onPresetNameChange={setPresetName}
              onSaveAsPreset={handleSaveAsPreset}
              onUpdatePreset={handleUpdatePreset}
              onLoadPreset={handleLoadPreset}
              onDeletePreset={handleDeletePreset}
              onGoogleLogin={handleGoogleLogin}
              onLogout={handleLogout}
              onSaveCurrentSettingsToCloud={handleSaveCurrentSettingsToCloud}
              onSavePresetsToCloud={handleSavePresetsToCloud}
              onLoadFromCloud={handleLoadFromCloud}
              onSelectedRoomChange={setSelectedRoomId}
              onRoomNameInputChange={setRoomNameInput}
              onCreateRoom={handleCreateRoom}
              onRenameRoom={handleRenameRoom}
              onDeleteRoom={handleDeleteRoom}
              onCreateShare={handleCreateShare}
              onUpdateShare={handleUpdateShare}
              onStopShare={handleStopShare}
              onCopyShareLink={handleCopyShareLink}
              onSubmit={handleApplySettings}
              onToggleFullscreen={handleToggleFullscreen}
            />
          ) : null}

          <ClockDisplay
            examTitle={examTitle}
            instructions={instructions}
            organizationName={organizationName}
            logoDataUrl={logoDataUrl}
            nowMs={nowMs}
            endDateTime={endDateTime}
            remainingMs={remainingMs}
            status={currentStatus}
            theme={theme}
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
        isShow={isShow}
        onTooglePannel={() => {
          setIsShow((cur) => !cur);
          setShortcutHelpOpen(false);
        }}
      />
    </main>
  );
}

function BrandMark({
  organizationName,
  logoDataUrl,
  theme,
}: {
  organizationName: string;
  logoDataUrl: string | null;
  theme: ClockTheme;
}) {
  const displayName = organizationName.trim() || DEFAULT_ORGANIZATION_NAME;

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoDataUrl}
          alt={`${displayName} 로고`}
          className="h-10 max-w-20 rounded-md object-contain sm:h-12 sm:max-w-28"
        />
      ) : null}
      <div className="min-w-0">
        <p
          className={`truncate text-sm font-semibold uppercase tracking-[0.24em] ${theme.accentClassName}`}
        >
          {displayName}
        </p>
        <p className={`mt-1 text-xs ${theme.mutedTextClassName}`}>
          clock.jogyo.web.app
        </p>
      </div>
    </div>
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
  theme,
  themeId,
  organizationName,
  logoDataUrl,
  presetName,
  currentPresetId,
  presets,
  firebaseServices,
  authUser,
  authReady,
  cloudAction,
  rooms,
  selectedRoomId,
  roomNameInput,
  roomAction,
  activeSharedClock,
  shareAction,
  onSettingsChange,
  onThemeChange,
  onOrganizationNameChange,
  onLogoUpload,
  onDefaultLogoSelect,
  onLogoDelete,
  onPresetNameChange,
  onSaveAsPreset,
  onUpdatePreset,
  onLoadPreset,
  onDeletePreset,
  onGoogleLogin,
  onLogout,
  onSaveCurrentSettingsToCloud,
  onSavePresetsToCloud,
  onLoadFromCloud,
  onSelectedRoomChange,
  onRoomNameInputChange,
  onCreateRoom,
  onRenameRoom,
  onDeleteRoom,
  onCreateShare,
  onUpdateShare,
  onStopShare,
  onCopyShareLink,
  onSubmit,
  onToggleFullscreen,
}: {
  settings: ExamSettings;
  errorMessage: string;
  fullscreenStatus: FullscreenStatus;
  isFullscreen: boolean;
  theme: ClockTheme;
  themeId: ThemeId;
  organizationName: string;
  logoDataUrl: string | null;
  presetName: string;
  currentPresetId: string | null;
  presets: ClockPreset[];
  firebaseServices: FirebaseServices | null;
  authUser: User | null;
  authReady: boolean;
  cloudAction: CloudAction;
  rooms: Room[];
  selectedRoomId: string;
  roomNameInput: string;
  roomAction: RoomAction;
  activeSharedClock: SharedClock | null;
  shareAction: ShareAction;
  onSettingsChange: (settings: ExamSettings) => void;
  onThemeChange: (themeId: ThemeId) => void;
  onOrganizationNameChange: (value: string) => void;
  onLogoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDefaultLogoSelect: (preset: DefaultLogoPreset) => void;
  onLogoDelete: () => void;
  onPresetNameChange: (value: string) => void;
  onSaveAsPreset: () => void;
  onUpdatePreset: () => void;
  onLoadPreset: (preset: ClockPreset) => void;
  onDeletePreset: (preset: ClockPreset) => void;
  onGoogleLogin: () => void;
  onLogout: () => void;
  onSaveCurrentSettingsToCloud: () => void;
  onSavePresetsToCloud: () => void;
  onLoadFromCloud: () => void;
  onSelectedRoomChange: (roomId: string) => void;
  onRoomNameInputChange: (value: string) => void;
  onCreateRoom: () => void;
  onRenameRoom: () => void;
  onDeleteRoom: () => void;
  onCreateShare: () => void;
  onUpdateShare: () => void;
  onStopShare: () => void;
  onCopyShareLink: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleFullscreen: () => void;
}) {
  const updateField = (field: keyof ExamSettings, value: string) => {
    onSettingsChange({
      ...settings,
      [field]: value,
    });
  };

  return (
    <aside
      className={`max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-lg border p-4 shadow-2xl backdrop-blur sm:p-5 ${theme.panelClassName}`}
    >
      <form
        className="flex h-full flex-col gap-5"
        onSubmit={onSubmit}
        noValidate
      >
        <section className="space-y-4">
          <div>
            <h1 className={`text-xl font-bold ${theme.primaryTextClassName}`}>
              시험 정보
            </h1>
            <p className={`mt-1 text-sm ${theme.mutedTextClassName}`}>
              종료 시각은 오늘 날짜 기준으로 계산됩니다.
            </p>
          </div>

          <Field label="시험 제목" htmlFor="exam-title" theme={theme}>
            <input
              id="exam-title"
              type="text"
              value={settings.title}
              onChange={(event) => updateField("title", event.target.value)}
              className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 ${theme.inputClassName}`}
              placeholder="기말고사"
            />
          </Field>

          <Field label="종료 시각" htmlFor="exam-end-time" theme={theme}>
            <input
              id="exam-end-time"
              type="time"
              value={settings.endTime}
              onChange={(event) => updateField("endTime", event.target.value)}
              className={`w-full rounded-md border px-3 py-3 font-mono text-base tabular-nums outline-none transition focus:ring-2 ${theme.inputClassName}`}
              required
            />
            {errorMessage ? (
              <p className="mt-2 text-sm font-medium text-red-300">
                {errorMessage}
              </p>
            ) : null}
          </Field>

          <Field label="주의사항" htmlFor="exam-notice" theme={theme}>
            <textarea
              id="exam-notice"
              value={settings.notice}
              onChange={(event) => updateField("notice", event.target.value)}
              className={`min-h-32 w-full resize-y rounded-md border px-3 py-3 text-base leading-7 outline-none transition focus:ring-2 ${theme.inputClassName}`}
              placeholder="시험 중 안내할 내용을 입력하세요"
            />
          </Field>
        </section>

        <section className="space-y-4 border-t border-current/10 pt-4">
          <h2 className={`text-lg font-bold ${theme.primaryTextClassName}`}>
            브랜딩
          </h2>

          <Field label="소속명" htmlFor="organization-name" theme={theme}>
            <input
              id="organization-name"
              type="text"
              value={organizationName}
              onChange={(event) => onOrganizationNameChange(event.target.value)}
              className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 ${theme.inputClassName}`}
              placeholder="Jogyo Clock"
            />
          </Field>

          <Field label="테마" htmlFor="clock-theme" theme={theme}>
            <select
              id="clock-theme"
              value={themeId}
              onChange={(event) =>
                onThemeChange(normalizeThemeId(event.target.value))
              }
              className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 ${theme.inputClassName}`}
            >
              {Object.values(CLOCK_THEMES).map((clockTheme) => (
                <option key={clockTheme.id} value={clockTheme.id}>
                  {clockTheme.name}
                </option>
              ))}
            </select>
            <p className={`mt-2 text-xs ${theme.mutedTextClassName}`}>
              {CLOCK_THEMES[themeId].description}
            </p>
          </Field>

          <Field label="로고" htmlFor="clock-logo" theme={theme}>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEFAULT_LOGO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onDefaultLogoSelect(preset)}
                  className="flex min-h-14 items-center gap-2 rounded-md border border-current/15 px-2 py-2 text-left transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preset.src}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="min-w-0 truncate text-sm font-bold">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
            <input
              id="clock-logo"
              type="file"
              accept="image/*"
              onChange={onLogoUpload}
              className={`w-full rounded-md border px-3 py-3 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-sm file:font-bold focus:ring-2 ${theme.inputClassName}`}
            />
            <div className="mt-3 flex items-center gap-3">
              {logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoDataUrl}
                  alt={`${
                    organizationName.trim() || DEFAULT_ORGANIZATION_NAME
                  } 로고`}
                  className="h-12 max-w-24 rounded-md bg-white p-1 object-contain"
                />
              ) : (
                <p className={`text-sm ${theme.mutedTextClassName}`}>
                  선택된 로고가 없습니다
                </p>
              )}
              <button
                type="button"
                aria-label="로고 삭제"
                onClick={onLogoDelete}
                disabled={!logoDataUrl}
                className="rounded-md border border-current/15 px-3 py-2 text-sm font-bold transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                로고 삭제
              </button>
            </div>
          </Field>
        </section>

        <section className="space-y-4 border-t border-current/10 pt-4">
          <h2 className={`text-lg font-bold ${theme.primaryTextClassName}`}>
            프리셋
          </h2>

          <Field label="프리셋 이름" htmlFor="preset-name" theme={theme}>
            <input
              id="preset-name"
              type="text"
              value={presetName}
              onChange={(event) => onPresetNameChange(event.target.value)}
              className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 ${theme.inputClassName}`}
              placeholder={settings.title || "기말고사"}
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="현재 설정을 새 프리셋으로 저장"
              onClick={onSaveAsPreset}
              className={`rounded-md px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 ${theme.buttonClassName}`}
            >
              새 이름으로 저장
            </button>
            <button
              type="button"
              aria-label="현재 프리셋 업데이트"
              onClick={onUpdatePreset}
              className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200"
            >
              {currentPresetId ? "프리셋 업데이트" : "현재 설정 저장"}
            </button>
          </div>

          <PresetList
            presets={presets}
            currentPresetId={currentPresetId}
            theme={theme}
            onLoadPreset={onLoadPreset}
            onDeletePreset={onDeletePreset}
          />
        </section>

        <CloudPanel
          theme={theme}
          firebaseServices={firebaseServices}
          authUser={authUser}
          authReady={authReady}
          cloudAction={cloudAction}
          presetCount={presets.length}
          onGoogleLogin={onGoogleLogin}
          onLogout={onLogout}
          onSaveCurrentSettingsToCloud={onSaveCurrentSettingsToCloud}
          onSavePresetsToCloud={onSavePresetsToCloud}
          onLoadFromCloud={onLoadFromCloud}
        />

        <RoomPanel
          theme={theme}
          firebaseServices={firebaseServices}
          authUser={authUser}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          roomNameInput={roomNameInput}
          roomAction={roomAction}
          onSelectedRoomChange={onSelectedRoomChange}
          onRoomNameInputChange={onRoomNameInputChange}
          onCreateRoom={onCreateRoom}
          onRenameRoom={onRenameRoom}
          onDeleteRoom={onDeleteRoom}
        />

        <SharePanel
          theme={theme}
          firebaseServices={firebaseServices}
          authUser={authUser}
          activeSharedClock={activeSharedClock}
          selectedRoom={
            rooms.find((room) => room.id === selectedRoomId) ?? null
          }
          shareAction={shareAction}
          onCreateShare={onCreateShare}
          onUpdateShare={onUpdateShare}
          onStopShare={onStopShare}
          onCopyShareLink={onCopyShareLink}
        />

        {fullscreenStatus === "unsupported" ? (
          <p className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
            현재 브라우저는 전체화면 기능을 지원하지 않습니다.
          </p>
        ) : null}

        <section className="grid gap-2 border-t border-current/10 pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <button
            type="submit"
            aria-label="시계 시작"
            className={`rounded-md px-4 py-3 text-base font-bold transition focus:outline-none focus:ring-2 ${theme.buttonClassName}`}
          >
            시계 시작
          </button>
          <button
            type="button"
            aria-label={isFullscreen ? "전체화면 해제" : "전체화면으로 보기"}
            onClick={onToggleFullscreen}
            disabled={fullscreenStatus !== "supported"}
            className="rounded-md border border-current/15 px-4 py-3 text-base font-bold transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFullscreen ? "전체화면 해제" : "전체화면"}
          </button>
        </section>
      </form>
    </aside>
  );
}

function Field({
  label,
  htmlFor,
  theme,
  children,
}: {
  label: string;
  htmlFor: string;
  theme: ClockTheme;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className={`block text-sm font-semibold ${theme.secondaryTextClassName}`}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function PresetList({
  presets,
  currentPresetId,
  theme,
  onLoadPreset,
  onDeletePreset,
}: {
  presets: ClockPreset[];
  currentPresetId: string | null;
  theme: ClockTheme;
  onLoadPreset: (preset: ClockPreset) => void;
  onDeletePreset: (preset: ClockPreset) => void;
}) {
  if (presets.length === 0) {
    return (
      <p
        className={`rounded-md border border-current/10 px-3 py-4 text-center text-sm ${theme.mutedTextClassName}`}
      >
        저장된 프리셋이 없습니다
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {presets.map((preset) => (
        <article
          key={preset.id}
          className={`rounded-md border p-3 ${
            preset.id === currentPresetId
              ? "border-teal-200/50 bg-teal-300/10"
              : "border-current/10 bg-current/5"
          }`}
        >
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-black ${theme.primaryTextClassName}`}
            >
              {preset.name}
            </p>
            <p className={`mt-1 text-xs ${theme.mutedTextClassName}`}>
              {preset.examTitle} · 종료 {preset.endTimeInput} · 수정{" "}
              {formatUpdatedAt(preset.updatedAt)}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-label={`${preset.name} 프리셋 불러오기`}
              onClick={() => onLoadPreset(preset)}
              className="rounded-md border border-current/15 px-3 py-2 text-sm font-bold transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200"
            >
              불러오기
            </button>
            <button
              type="button"
              aria-label={`${preset.name} 프리셋 삭제`}
              onClick={() => onDeletePreset(preset)}
              className="rounded-md border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              삭제
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CloudPanel({
  theme,
  firebaseServices,
  authUser,
  authReady,
  cloudAction,
  presetCount,
  onGoogleLogin,
  onLogout,
  onSaveCurrentSettingsToCloud,
  onSavePresetsToCloud,
  onLoadFromCloud,
}: {
  theme: ClockTheme;
  firebaseServices: FirebaseServices | null;
  authUser: User | null;
  authReady: boolean;
  cloudAction: CloudAction;
  presetCount: number;
  onGoogleLogin: () => void;
  onLogout: () => void;
  onSaveCurrentSettingsToCloud: () => void;
  onSavePresetsToCloud: () => void;
  onLoadFromCloud: () => void;
}) {
  const firebaseDisabled =
    firebaseServices === null || firebaseServices.status === "disabled";
  const isBusy = cloudAction !== null;
  const canUseCloud =
    authReady && !firebaseDisabled && Boolean(authUser) && !isBusy;
  const userLabel =
    authUser?.displayName || authUser?.email || "로그인한 사용자";
  const statusText = firebaseDisabled
    ? "Firebase 환경변수가 설정되지 않았습니다"
    : authUser
      ? "클라우드 동기화 가능"
      : "로그인하면 프리셋을 클라우드에 저장할 수 있습니다";

  return (
    <section className="space-y-4 border-t border-current/10 pt-4">
      <div>
        <h2 className={`text-lg font-bold ${theme.primaryTextClassName}`}>
          클라우드
        </h2>
        <p className={`mt-1 text-sm ${theme.mutedTextClassName}`}>
          {statusText}
        </p>
        {firebaseServices?.status === "disabled" ? (
          <p className="mt-2 rounded-md border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-xs text-yellow-100">
            누락된 환경변수: {firebaseServices.missingKeys.join(", ")}
          </p>
        ) : null}
      </div>

      {authUser ? (
        <div className="rounded-md border border-current/10 bg-current/5 px-3 py-3">
          <p className={`text-xs ${theme.mutedTextClassName}`}>현재 사용자</p>
          <p
            className={`mt-1 truncate text-sm font-black ${theme.primaryTextClassName}`}
          >
            {userLabel}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {authUser ? (
          <button
            type="button"
            aria-label="로그아웃"
            onClick={onLogout}
            disabled={firebaseDisabled || isBusy}
            className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cloudAction === "logout" ? "로그아웃 중..." : "로그아웃"}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Google 로그인"
            onClick={onGoogleLogin}
            disabled={firebaseDisabled || !authReady || isBusy}
            className={`rounded-md px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme.buttonClassName}`}
          >
            {cloudAction === "login" ? "로그인 중..." : "Google 로그인"}
          </button>
        )}
        <button
          type="button"
          aria-label="클라우드에서 불러오기"
          onClick={onLoadFromCloud}
          disabled={!canUseCloud}
          className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cloudAction === "load" ? "불러오는 중..." : "클라우드에서 불러오기"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-label="현재 설정 클라우드 저장"
          onClick={onSaveCurrentSettingsToCloud}
          disabled={!canUseCloud}
          className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cloudAction === "saveSettings"
            ? "저장 중..."
            : "현재 설정 클라우드 저장"}
        </button>
        <button
          type="button"
          aria-label="로컬 프리셋 클라우드에 저장"
          onClick={onSavePresetsToCloud}
          disabled={!canUseCloud || presetCount === 0}
          className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cloudAction === "savePresets"
            ? "저장 중..."
            : "로컬 프리셋 클라우드에 저장"}
        </button>
      </div>
    </section>
  );
}

function RoomPanel({
  theme,
  firebaseServices,
  authUser,
  rooms,
  selectedRoomId,
  roomNameInput,
  roomAction,
  onSelectedRoomChange,
  onRoomNameInputChange,
  onCreateRoom,
  onRenameRoom,
  onDeleteRoom,
}: {
  theme: ClockTheme;
  firebaseServices: FirebaseServices | null;
  authUser: User | null;
  rooms: Room[];
  selectedRoomId: string;
  roomNameInput: string;
  roomAction: RoomAction;
  onSelectedRoomChange: (roomId: string) => void;
  onRoomNameInputChange: (value: string) => void;
  onCreateRoom: () => void;
  onRenameRoom: () => void;
  onDeleteRoom: () => void;
}) {
  const firebaseDisabled =
    firebaseServices === null || firebaseServices.status === "disabled";
  const canManageRooms = !firebaseDisabled && Boolean(authUser) && !roomAction;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  return (
    <section className="space-y-4 border-t border-current/10 pt-4">
      <div>
        <h2 className={`text-lg font-bold ${theme.primaryTextClassName}`}>
          강의실 / 시험실
        </h2>
        <p className={`mt-1 text-sm ${theme.mutedTextClassName}`}>
          {authUser
            ? "공유 링크에 포함할 강의실을 선택하세요"
            : "로그인하면 강의실별 공유 시계를 관리할 수 있습니다"}
        </p>
      </div>

      <Field label="강의실 선택" htmlFor="room-select" theme={theme}>
        <select
          id="room-select"
          value={selectedRoomId}
          onChange={(event) => onSelectedRoomChange(event.target.value)}
          disabled={!canManageRooms || rooms.length === 0}
          className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${theme.inputClassName}`}
        >
          {rooms.length === 0 ? (
            <option value="">저장된 강의실이 없습니다</option>
          ) : null}
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="강의실 이름" htmlFor="room-name" theme={theme}>
        <input
          id="room-name"
          type="text"
          value={roomNameInput}
          onChange={(event) => onRoomNameInputChange(event.target.value)}
          disabled={!canManageRooms}
          className={`w-full rounded-md border px-3 py-3 text-base outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${theme.inputClassName}`}
          placeholder={selectedRoom?.name || "농심국제관 305호"}
        />
      </Field>

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          aria-label="강의실 생성"
          onClick={onCreateRoom}
          disabled={!canManageRooms}
          className={`rounded-md px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme.buttonClassName}`}
        >
          {roomAction === "create" ? "생성 중..." : "생성"}
        </button>
        <button
          type="button"
          aria-label="강의실 이름 수정"
          onClick={onRenameRoom}
          disabled={!canManageRooms || !selectedRoom}
          className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {roomAction === "update" ? "수정 중..." : "수정"}
        </button>
        <button
          type="button"
          aria-label="강의실 삭제"
          onClick={onDeleteRoom}
          disabled={!canManageRooms || !selectedRoom}
          className="rounded-md border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {roomAction === "delete" ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </section>
  );
}

function SharePanel({
  theme,
  firebaseServices,
  authUser,
  activeSharedClock,
  selectedRoom,
  shareAction,
  onCreateShare,
  onUpdateShare,
  onStopShare,
  onCopyShareLink,
}: {
  theme: ClockTheme;
  firebaseServices: FirebaseServices | null;
  authUser: User | null;
  activeSharedClock: SharedClock | null;
  selectedRoom: Room | null;
  shareAction: ShareAction;
  onCreateShare: () => void;
  onUpdateShare: () => void;
  onStopShare: () => void;
  onCopyShareLink: () => void;
}) {
  const firebaseDisabled =
    firebaseServices === null || firebaseServices.status === "disabled";
  const canShare = !firebaseDisabled && Boolean(authUser) && !shareAction;
  const shareUrl = activeSharedClock
    ? getPublicShareUrl(activeSharedClock.id)
    : "";

  return (
    <section className="space-y-4 border-t border-current/10 pt-4">
      <div>
        <h2 className={`text-lg font-bold ${theme.primaryTextClassName}`}>
          공유 링크 / QR
        </h2>
        <p className={`mt-1 text-sm ${theme.mutedTextClassName}`}>
          학생 또는 보조 감독자가 이 링크를 열면 읽기 전용 시계를 볼 수
          있습니다.
        </p>
      </div>

      {selectedRoom ? (
        <p
          className={`rounded-md border border-current/10 bg-current/5 px-3 py-2 text-sm ${theme.secondaryTextClassName}`}
        >
          선택된 강의실: <span className="font-black">{selectedRoom.name}</span>
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-label="공유 링크 생성"
          onClick={onCreateShare}
          disabled={!canShare}
          className={`rounded-md px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme.buttonClassName}`}
        >
          {shareAction === "create" ? "생성 중..." : "공유 링크 생성"}
        </button>
        <button
          type="button"
          aria-label="공유 시계 업데이트"
          onClick={onUpdateShare}
          disabled={!canShare || !activeSharedClock}
          className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {shareAction === "update" ? "업데이트 중..." : "공유 시계 업데이트"}
        </button>
      </div>

      {activeSharedClock ? (
        <div className="space-y-3 rounded-md border border-current/10 bg-current/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm font-black ${theme.primaryTextClassName}`}>
              {activeSharedClock.isPublic ? "공유 중" : "공유 중지됨"}
            </p>
            <p className={`text-xs ${theme.mutedTextClassName}`}>
              마지막 업데이트{" "}
              {formatClockTime(new Date(activeSharedClock.updatedAt))}
            </p>
          </div>
          <input
            readOnly
            aria-label="공유 링크"
            value={shareUrl}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none ${theme.inputClassName}`}
          />
          {activeSharedClock.isPublic ? (
            <div className="flex justify-center rounded-md bg-white p-3">
              <QRCodeSVG value={shareUrl} size={180} />
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-label="공유 링크 복사"
              onClick={onCopyShareLink}
              disabled={!activeSharedClock || shareAction === "copy"}
              className="rounded-md border border-current/15 px-4 py-3 text-sm font-black transition hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {shareAction === "copy" ? "복사 중..." : "링크 복사"}
            </button>
            <button
              type="button"
              aria-label="공유 중지"
              onClick={onStopShare}
              disabled={!canShare || !activeSharedClock.isPublic}
              className="rounded-md border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {shareAction === "stop" ? "중지 중..." : "공유 중지"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClockDisplay({
  examTitle,
  instructions,
  organizationName,
  logoDataUrl,
  nowMs,
  endDateTime,
  remainingMs,
  status,
  theme,
  className = "",
}: {
  examTitle: string;
  instructions: string;
  organizationName: string;
  logoDataUrl: string | null;
  nowMs: number | null;
  endDateTime: number | null;
  remainingMs: number;
  status: ClockStatus;
  theme: ClockTheme;
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
      className={`flex min-h-[calc(100dvh-8.5rem)] flex-col rounded-lg border px-4 py-6 shadow-2xl sm:px-6 lg:px-10 ${theme.clockPanelClassName} ${className}`}
    >
      <div className="text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt={`${
                organizationName.trim() || DEFAULT_ORGANIZATION_NAME
              } 로고`}
              className="h-10 max-w-24 rounded-md object-contain sm:h-14 sm:max-w-36"
            />
          ) : null}
          <p
            className={`truncate text-sm font-semibold uppercase tracking-[0.24em] sm:text-base ${theme.accentClassName}`}
          >
            {organizationName.trim() || DEFAULT_ORGANIZATION_NAME}
          </p>
        </div>
        <p
          className={`text-sm font-semibold uppercase tracking-[0.24em] ${
            status === "paused"
              ? "text-amber-200"
              : status === "ended"
                ? "text-red-200"
                : theme.mutedTextClassName
          }`}
        >
          {statusLabel}
        </p>
        <h2
          className={`mt-3 break-keep text-3xl font-black sm:text-5xl lg:text-6xl ${theme.primaryTextClassName}`}
        >
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
                : theme.accentClassName
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
            theme={theme}
          />
          <InfoRow
            label="종료 시각"
            value={
              endDateTime ? formatTimeOnly(new Date(endDateTime)) : "--:--"
            }
            theme={theme}
          />
        </div>

        {instructions.trim() ? (
          <div className="mx-auto max-w-5xl rounded-lg border border-current/10 bg-current/10 px-4 py-4 text-center text-lg font-semibold leading-8 sm:text-2xl sm:leading-10">
            <p
              className={`whitespace-pre-line break-keep ${theme.secondaryTextClassName}`}
            >
              {instructions}
            </p>
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
  onToggleHelp,
  isShow,
  onTooglePannel,
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
  isShow: boolean;
  onTooglePannel: () => void;
}) {
  return (
    <aside className="fixed bottom-4 right-4 z-30 w-[min(calc(100vw-2rem),360px)] rounded-lg border border-white/10 bg-slate-950/55 p-3 text-white shadow-2xl shadow-black/30 backdrop-blur transition hover:bg-slate-950/85 focus-within:bg-slate-950/90">
      <div
        className={`${isShow ? "mb-2" : ""} flex items-center justify-between gap-2`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
          감독 컨트롤
        </p>
        <div>
          {isShow ? (
            <button
              type="button"
              aria-label="단축키 도움말 열기 또는 닫기"
              onClick={onToggleHelp}
              className="rounded-md border border-white/10 px-2 py-1 text-xs font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-200 mr-2"
            >
              단축키
            </button>
          ) : null}
          <button
            type="button"
            aria-label="관리자 패널 열기 또는 닫기"
            onClick={onTooglePannel}
            className="rounded-md border border-white/10 px-2 py-1 text-xs font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-200"
          >
            {isShow ? "닫기" : "열기"}
          </button>
        </div>
      </div>

      {isShow ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            <ControlButton
              label="+1분"
              ariaLabel="시험 시간 1분 연장"
              onClick={() => onAdjust(1)}
            />
            <ControlButton
              label="+5분"
              ariaLabel="시험 시간 5분 연장"
              onClick={() => onAdjust(5)}
            />
            <ControlButton
              label="-1분"
              ariaLabel="시험 시간 1분 단축"
              onClick={() => onAdjust(-1)}
            />
            <ControlButton
              label="-5분"
              ariaLabel="시험 시간 5분 단축"
              onClick={() => onAdjust(-5)}
            />
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
        </>
      ) : null}

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
  disabled = false,
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

function InfoRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ClockTheme;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-center ${theme.infoCardClassName}`}
    >
      <p className={`text-sm font-semibold ${theme.mutedTextClassName}`}>
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl ${theme.primaryTextClassName}`}
      >
        {value}
      </p>
    </div>
  );
}
