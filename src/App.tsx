import {
  Archive,
  ArrowLeft,
  BarChart3,
  Camera,
  CheckCircle2,
  Copy,
  Crown,
  Dices,
  Flag,
  Gauge,
  Heart,
  Link,
  Music2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
  Volume2,
  Zap
} from "lucide-react";
import type { ReactNode, RefObject, SyntheticEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SongCard } from "./components/SongCard";
import { loadSongCatalog } from "./data/songs";
import { compareLevel, getRoundName, makeGroups, shuffleWithSeed, toCupEntries } from "./lib/tournament";
import { CupEntry, CupFilters, Difficulty, MatchRecord, Song } from "./types";

type Phase = "config" | "draw" | "groups" | "revival" | "bracket" | "result";
type CaptureState = "idle" | "working" | "success" | "error";
type CopyState = "idle" | "success" | "error";
type PosterTheme = "sakura" | "neon" | "gold" | "clean";

type BracketSnapshot = {
  roundEntries: CupEntry[];
  roundWinners: CupEntry[];
  matchIndex: number;
  history: MatchRecord[];
};

type TournamentArchive = {
  id: string;
  createdAt: string;
  modeLabel: string;
  ruleCode: string;
  seed: string;
  championTitle: string;
  championArtist: string;
  championJacket: string;
  runnerUpTitle?: string;
  topFourTitles: string[];
};

type TournamentStats = {
  matchCount: number;
  categoryLeader: string;
  versionLeader: string;
  highestConstant: string;
  defeatedDesigners: string[];
  championPathText: string;
};

type RulePreset = {
  id: string;
  title: string;
  desc: string;
  filters: Partial<CupFilters>;
};

const difficulties: Difficulty[] = ["Basic", "Advanced", "Expert", "Master", "Re:Master"];
const posterThemes: { id: PosterTheme; label: string }[] = [
  { id: "sakura", label: "樱花赛事" },
  { id: "neon", label: "霓虹街机" },
  { id: "gold", label: "黑金冠军" },
  { id: "clean", label: "简洁分享" }
];
const rulePresets: RulePreset[] = [
  {
    id: "song-pop",
    title: "本命歌曲杯",
    desc: "默认歌曲杯，只按分类和版本抽歌。",
    filters: { mode: "song", categories: [], versions: [] }
  },
  {
    id: "chart-exp-13",
    title: "红谱 13 段位",
    desc: "Expert / Lv 13-13+，适合快速开打。",
    filters: { mode: "chart", difficulties: ["Expert"], rangeMode: "level", minLevel: "13", maxLevel: "13+" }
  },
  {
    id: "chart-master-14",
    title: "紫谱神仙杯",
    desc: "Master / Lv 14-14+，强度直接拉满。",
    filters: { mode: "chart", difficulties: ["Master"], rangeMode: "level", minLevel: "14", maxLevel: "14+" }
  },
  {
    id: "chart-remaster",
    title: "白谱特别赛",
    desc: "Re:Master 全池，只抽白谱。",
    filters: { mode: "chart", difficulties: ["Re:Master"], rangeMode: "level", minLevel: "1", maxLevel: "15" }
  },
  {
    id: "new-era",
    title: "新曲版本杯",
    desc: "PRiSM / CiRCLE 系列优先。",
    filters: { mode: "song", versions: ["PRiSM", "PRiSM PLUS", "CiRCLE", "CiRCLE PLUS"] }
  },
  {
    id: "classic",
    title: "怀旧街机杯",
    desc: "maimai 到 PiNK 时代。",
    filters: { mode: "song", versions: ["maimai", "maimai PLUS", "GreeN", "GreeN PLUS", "ORANGE", "ORANGE PLUS", "PiNK"] }
  }
];
const fallbackFilters: CupFilters = {
  mode: "song",
  categories: [],
  versions: [],
  difficulties: ["Expert", "Master", "Re:Master"],
  rangeMode: "level",
  minLevel: "1",
  maxLevel: "15",
  minConstant: 1,
  maxConstant: 15,
  seed: randomSeed()
};
const defaultFilters: CupFilters = createDefaultFilters();
const defaultSeed = defaultFilters.seed;

export default function App() {
  const [phase, setPhase] = useState<Phase>("config");
  const [filters, setFilters] = useState<CupFilters>(defaultFilters);
  const [seedDraft, setSeedDraft] = useState(defaultSeed);
  const [seedCopyState, setSeedCopyState] = useState<CopyState>("idle");
  const [autoLinkCopyState, setAutoLinkCopyState] = useState<CopyState>("idle");
  const [posterTheme, setPosterTheme] = useState<PosterTheme>(() => loadLocalValue("mmc-poster-theme", "sakura") as PosterTheme);
  const [favoriteSongIds, setFavoriteSongIds] = useState<string[]>(() => loadLocalArray("mmc-favorite-song-ids"));
  const [excludedSongIds, setExcludedSongIds] = useState<string[]>(() => loadLocalArray("mmc-excluded-song-ids"));
  const [archives, setArchives] = useState<TournamentArchive[]>(() => loadArchives());
  const [revivalRevealCount, setRevivalRevealCount] = useState(0);
  const [duelPreviewingId, setDuelPreviewingId] = useState("");
  const [duelBlindMode, setDuelBlindMode] = useState(false);
  const [groups, setGroups] = useState<CupEntry[][]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [qualified, setQualified] = useState<CupEntry[]>([]);
  const [eliminated, setEliminated] = useState<CupEntry[]>([]);
  const [revivalSelection, setRevivalSelection] = useState<string[]>([]);
  const [roundEntries, setRoundEntries] = useState<CupEntry[]>([]);
  const [roundWinners, setRoundWinners] = useState<CupEntry[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [champion, setChampion] = useState<CupEntry | null>(null);
  const [undoStack, setUndoStack] = useState<BracketSnapshot[]>([]);
  const [drawError, setDrawError] = useState("");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [catalogSongs, setCatalogSongs] = useState<Song[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogUsingImported, setCatalogUsingImported] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const autoDrawStartedRef = useRef(false);
  const duelAudioRef = useRef<HTMLAudioElement | null>(null);
  const archivedChampionRef = useRef("");

  function readSeed() {
    return normalizeSeed(seedDraft) || filters.seed;
  }

  useEffect(() => {
    let cancelled = false;
    loadSongCatalog().then((catalog) => {
      if (cancelled) return;
      setCatalogSongs(catalog.songs);
      setCatalogUsingImported(catalog.usingImportedSongs);
      setCatalogError(catalog.error || "");
      setCatalogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const songs = catalogSongs;
  const usingImportedSongs = catalogUsingImported;
  const categories = useMemo(() => unique(songs.map((song) => song.category)), [songs]);
  const versions = useMemo(() => unique(songs.map((song) => song.version)), [songs]);
  const levelOptions = useMemo(
    () => unique(songs.flatMap((song) => song.charts.map((chart) => chart.level))).sort(compareLevel),
    [songs]
  );
  const constantBounds = useMemo(() => {
    const values = songs.flatMap((song) => song.charts.map((chart) => chart.constant)).filter(isNumber);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  }, [songs]);
  useEffect(() => {
    if (!levelOptions.length) return;
    const first = levelOptions[0];
    const last = levelOptions[levelOptions.length - 1];
    setFilters((current) =>
      levelOptions.includes(current.minLevel) && levelOptions.includes(current.maxLevel)
        ? current
        : { ...current, minLevel: first, maxLevel: last }
    );
  }, [levelOptions]);
  // 种子不参与筛选，必须排除在依赖之外：否则每敲一个字符都会把
  // 1587 首歌 / 6000+ 张谱重新过一遍，低端手机上会卡到打不出字。
  const poolSignature = [
    filters.mode,
    filters.categories.join("|"),
    filters.versions.join("|"),
    filters.difficulties.join("|"),
    filters.rangeMode,
    filters.minLevel,
    filters.maxLevel,
    filters.minConstant,
    filters.maxConstant,
    excludedSongIds.join("|")
  ].join("::");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rawPool = useMemo(() => toCupEntries(songs, filters), [songs, poolSignature]);
  const pool = useMemo(
    () => rawPool.filter((entry) => !excludedSongIds.includes(entry.songId)),
    [rawPool, excludedSongIds]
  );
  const uniquePoolEntries = useMemo(() => new Set(pool.map((entry) => entry.id)).size, [pool]);
  const canStart = !catalogLoading && uniquePoolEntries >= 48;
  const modeLabel = cupModeLabel(filters.mode);
  const difficultyModeText =
    filters.mode === "chart"
      ? `${filters.difficulties[0] ?? "Expert"} / ${filters.rangeMode === "level" ? `Lv ${filters.minLevel}–${filters.maxLevel}` : `定数 ${filters.minConstant.toFixed(1)}–${filters.maxConstant.toFixed(1)}`}`
      : "歌曲本体 · 不区分难度";
  const catalogLabel = catalogLoading ? "曲库加载中" : usingImportedSongs ? "JP 曲库" : "Mock 曲库";
  const activeSeed = phase === "config" ? readSeed() : filters.seed;
  const ruleCode = makeRuleCode({ ...filters, seed: activeSeed });
  const cupMeta = `${modeLabel} / ${catalogLabel} / ${ruleCode} / Seed ${activeSeed || "maimai-cup"}`;
  const transitionKey = `${phase}-${roundEntries.length}`;
  const currentGroup = groups[groupIndex] ?? [];
  const currentRoundName = getRoundName(roundEntries.length);
  const currentMatch = [roundEntries[matchIndex * 2], roundEntries[matchIndex * 2 + 1]].filter(isEntry);
  const finalRecord = history.find((record) => record.round === "决赛");
  const semifinalRecords = history.filter((record) => record.round === "半决赛");
  const topFour = uniqueEntries([
    ...semifinalRecords.flatMap((record) => [record.winner, record.loser]),
    champion
  ].filter(Boolean) as CupEntry[]);
  const championPath = champion ? history.filter((record) => record.winner.id === champion.id) : [];
  const revivalPicks = useMemo(
    () => eliminated.filter((entry) => revivalSelection.includes(entry.id)),
    [eliminated, revivalSelection]
  );
  const tournamentStats = useMemo(
    () => buildTournamentStats([...groups.flat(), ...qualified, ...revivalPicks], history, champion),
    [groups, qualified, revivalPicks, history, champion]
  );

  useEffect(() => {
    saveLocalArray("mmc-favorite-song-ids", favoriteSongIds);
  }, [favoriteSongIds]);

  useEffect(() => {
    saveLocalArray("mmc-excluded-song-ids", excludedSongIds);
  }, [excludedSongIds]);

  useEffect(() => {
    localStorage.setItem("mmc-poster-theme", posterTheme);
  }, [posterTheme]);

  useEffect(() => {
    if (catalogLoading || autoDrawStartedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") !== "draw") return;
    autoDrawStartedRef.current = true;
    window.setTimeout(() => startDraw(readSeed()), 80);
  }, [catalogLoading]);

  useEffect(() => {
    if (phase !== "bracket" || currentMatch.length < 2) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key.toLowerCase() === "a") chooseWinner(currentMatch[0]);
      if (event.key.toLowerCase() === "d") chooseWinner(currentMatch[1]);
      if (event.key === "1") playDuelPreview(currentMatch[0]);
      if (event.key === "2") playDuelPreview(currentMatch[1]);
      if (event.key === " ") {
        event.preventDefault();
        stopDuelPreview();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, currentMatch[0]?.id, currentMatch[1]?.id]);

  useEffect(() => {
    stopDuelPreview();
  }, [phase, matchIndex, roundEntries.length]);

  useEffect(() => {
    if (phase !== "result" || !champion) return;
    const archiveId = `${filters.seed}-${champion.id}-${history.length}`;
    if (archivedChampionRef.current === archiveId) return;
    archivedChampionRef.current = archiveId;
    const nextArchive: TournamentArchive = {
      id: archiveId,
      createdAt: new Date().toISOString(),
      modeLabel,
      ruleCode,
      seed: filters.seed,
      championTitle: champion.title,
      championArtist: champion.artist,
      championJacket: champion.jacket,
      runnerUpTitle: finalRecord?.loser.title,
      topFourTitles: topFour.slice(0, 4).map((entry) => entry.title)
    };
    setArchives((current) => saveArchives([nextArchive, ...current.filter((item) => item.id !== archiveId)].slice(0, 12)));
  }, [phase, champion?.id]);

  function startDraw(seed = filters.seed) {
    if (catalogLoading) {
      setDrawError("曲库还在加载，请稍等一下再开赛。");
      return;
    }

    const nextSeed = normalizeSeed(seed);
    const seededFilters = { ...filters, seed: nextSeed };
    const entries = toCupEntries(songs, seededFilters).filter((entry) => !excludedSongIds.includes(entry.songId));
    const nextGroups = makeGroups(entries, drawSeedFor(seededFilters));
    const drawn = nextGroups.flat();

    if (drawn.length !== 48 || new Set(drawn.map((entry) => entry.id)).size !== 48) {
      setDrawError("当前筛选不足 48 个唯一参赛项，请放宽筛选条件后重试。");
      return;
    }

    setDrawError("");
    setSeedDraft(nextSeed);
    setFilters(seededFilters);
    syncCupUrl(seededFilters);
    setGroups(nextGroups);
    setGroupIndex(0);
    setGroupSelection([]);
    setQualified([]);
    setEliminated([]);
    setRevivalSelection([]);
    setRoundEntries([]);
    setRoundWinners([]);
    setMatchIndex(0);
    setHistory([]);
    setChampion(null);
    setUndoStack([]);
    setRevivalRevealCount(0);
    setPhase("draw");
  }

  function applyPreset(preset: RulePreset) {
    const nextFilters: CupFilters = {
      ...filters,
      ...preset.filters,
      categories: preset.filters.categories?.filter((category) => categories.includes(category)) ?? filters.categories,
      versions: preset.filters.versions?.filter((version) => versions.includes(version)) ?? filters.versions,
      difficulties: preset.filters.difficulties ?? filters.difficulties,
      seed: randomSeed()
    };
    setFilters(nextFilters);
    setSeedDraft(nextFilters.seed);
    syncCupUrl(nextFilters);
  }

  function toggleFavorite(entry: CupEntry) {
    setFavoriteSongIds((items) => toggleValue(items, entry.songId));
  }

  function toggleExcluded(entry: CupEntry) {
    setExcludedSongIds((items) => toggleValue(items, entry.songId));
  }

  function startGroups() {
    setGroupIndex(0);
    setGroupSelection([]);
    setQualified([]);
    setEliminated([]);
    setPhase("groups");
  }

  function toggleGroupPick(entry: CupEntry) {
    setGroupSelection((selection) => {
      if (selection.includes(entry.id)) {
        return selection.filter((id) => id !== entry.id);
      }
      if (selection.length >= 2) {
        return selection;
      }
      return [...selection, entry.id];
    });
  }

  function confirmGroup() {
    if (groupSelection.length !== 2) {
      return;
    }

    const winners = currentGroup.filter((entry) => groupSelection.includes(entry.id));
    const losers = currentGroup.filter((entry) => !groupSelection.includes(entry.id));
    setQualified((items) => [...items, ...winners]);
    setEliminated((items) => [...items, ...losers]);
    setGroupSelection([]);

    if (groupIndex === groups.length - 1) {
      setPhase("revival");
      return;
    }

    setGroupIndex((index) => index + 1);
  }

  function toggleRevivalPick(entry: CupEntry) {
    setRevivalRevealCount(0);
    setRevivalSelection((selection) => {
      if (selection.includes(entry.id)) {
        return selection.filter((id) => id !== entry.id);
      }
      if (selection.length >= 8) {
        return selection;
      }
      return [...selection, entry.id];
    });
  }

  function revealRevivalLineup() {
    if (revivalSelection.length !== 8) return;
    setRevivalRevealCount(0);
    let next = 0;
    const timer = window.setInterval(() => {
      next += 1;
      setRevivalRevealCount(next);
      if (next >= 8) {
        window.clearInterval(timer);
      }
    }, 220);
  }

  function startBracket() {
    if (revivalSelection.length !== 8 || revivalRevealCount < 8) {
      return;
    }
    const revived = eliminated.filter((entry) => revivalSelection.includes(entry.id));
    const top32 = shuffleWithSeed([...qualified, ...revived], `${drawSeedFor(filters)}-top32`);
    setRoundEntries(top32);
    setRoundWinners([]);
    setMatchIndex(0);
    setHistory([]);
    setUndoStack([]);
    setPhase("bracket");
  }

  function playDuelPreview(entry: CupEntry) {
    if (!entry.previewAudio) return;
    stopDuelPreview();
    const audio = new Audio(entry.previewAudio);
    duelAudioRef.current = audio;
    setDuelPreviewingId(entry.id);
    audio.addEventListener("ended", () => setDuelPreviewingId(""));
    audio.addEventListener("pause", () => setDuelPreviewingId(""));
    audio.play().catch(() => setDuelPreviewingId(""));
  }

  function stopDuelPreview() {
    const audio = duelAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    duelAudioRef.current = null;
    setDuelPreviewingId("");
  }

  function playRandomDuelPreview() {
    if (currentMatch.length < 2) return;
    playDuelPreview(currentMatch[Math.floor(Math.random() * currentMatch.length)]);
  }

  function chooseWinner(winner: CupEntry) {
    if (currentMatch.length < 2) {
      return;
    }
    setUndoStack((stack) => [...stack, { roundEntries, roundWinners, matchIndex, history }]);
    const [left, right] = currentMatch;
    const loser = left.id === winner.id ? right : left;
    const matchRecord: MatchRecord = {
      round: currentRoundName,
      matchNumber: matchIndex + 1,
      winner,
      loser
    };
    const nextWinners = [...roundWinners, winner];
    const nextHistory = [...history, matchRecord];
    setHistory(nextHistory);

    if (matchIndex < roundEntries.length / 2 - 1) {
      setRoundWinners(nextWinners);
      setMatchIndex((index) => index + 1);
      return;
    }

    if (nextWinners.length === 1) {
      setChampion(winner);
      setPhase("result");
      return;
    }

    setRoundEntries(nextWinners);
    setRoundWinners([]);
    setMatchIndex(0);
  }

  function undoLastMatch() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setRoundEntries(prev.roundEntries);
      setRoundWinners(prev.roundWinners);
      setMatchIndex(prev.matchIndex);
      setHistory(prev.history);
      setChampion(null);
      setPhase("bracket");
      return stack.slice(0, -1);
    });
  }

  async function downloadShareImage() {
    if (!resultRef.current) {
      return;
    }
    setCaptureState("working");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(resultRef.current, {
        backgroundColor: "#130810",
        scale: Math.min(window.devicePixelRatio || 2, 3),
        useCORS: true,
        logging: false,
        windowWidth: 1280,
        onclone: (documentClone) => {
          documentClone.querySelector(".share-poster")?.classList.add("capture-mode");
        }
      });
      const link = document.createElement("a");
      const safeTitle = (champion?.title ?? "result").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
      link.download = `maimai-cup-${safeTitle}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setCaptureState("success");
    } catch {
      setCaptureState("error");
    }
  }

  function resetAll() {
    stopDuelPreview();
    setPhase("config");
    setGroups([]);
    setGroupIndex(0);
    setGroupSelection([]);
    setQualified([]);
    setEliminated([]);
    setRevivalSelection([]);
    setRoundEntries([]);
    setRoundWinners([]);
    setMatchIndex(0);
    setHistory([]);
    setChampion(null);
    setUndoStack([]);
    setDrawError("");
    setCaptureState("idle");
    setRevivalRevealCount(0);
  }

  async function copySeedLink() {
    const nextFilters = { ...filters, seed: readSeed() };
    const url = buildCupUrl(nextFilters);
    setFilters(nextFilters);
    setSeedDraft(nextFilters.seed);
    syncCupUrl(nextFilters);
    try {
      await copyText(url);
      setSeedCopyState("success");
    } catch {
      setSeedCopyState("error");
    }
    window.setTimeout(() => setSeedCopyState("idle"), 1800);
  }

  async function copyAutoDrawLink() {
    const nextFilters = { ...filters, seed: readSeed() };
    const url = buildCupUrl(nextFilters, { autoDraw: true });
    setFilters(nextFilters);
    setSeedDraft(nextFilters.seed);
    syncCupUrl(nextFilters);
    try {
      await copyText(url);
      setAutoLinkCopyState("success");
    } catch {
      setAutoLinkCopyState("error");
    }
    window.setTimeout(() => setAutoLinkCopyState("idle"), 1800);
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">MAIMAI CUP</p>
          <h1>舞萌本命之巅</h1>
          <div className="cup-context">
            <span>{modeLabel}</span>
            <span>{catalogLabel}</span>
            <span>{difficultyModeText}</span>
          </div>
        </div>
        <div className="phase-badge">
          <Trophy size={17} />
          {phaseLabel(phase)}
        </div>
      </div>

      <CupStepper phase={phase} />

      <div className="phase-stage" key={transitionKey}>
        <StageIntro intro={getStageIntro(phase, roundEntries.length)} />
        {phase === "config" ? (
        <section className="config-layout phase-panel config-panel">
          <div className="control-surface">
            <div className="section-title">
              <Zap size={18} />
              赛事配置
            </div>

            <div className="mode-toggle">
              <button className={filters.mode === "song" ? "active" : ""} onClick={() => setFilters({ ...filters, mode: "song" })}>
                <Music2 size={18} />
                歌曲杯
              </button>
              <button
                className={filters.mode === "chart" ? "active" : ""}
                onClick={() =>
                  setFilters({
                    ...filters,
                    mode: "chart",
                    difficulties: [filters.difficulties[0] ?? "Expert"]
                  })
                }
              >
                <Gauge size={18} />
                谱面杯
              </button>
            </div>

            <p className="filter-hint mode-desc">
              {catalogLoading
                ? "曲库加载中，配置项会在数据到达后自动展开。"
                : filters.mode === "song"
                  ? "歌曲杯：以「一首歌」为参赛单位，不区分谱面难度。"
                  : "谱面杯：以「歌 + 单一难度谱面」参赛，整届固定同难度对决。"}
            </p>
            {catalogError ? <p className="filter-hint subtle-hint">真实曲库读取失败，已临时使用 Mock 曲库：{catalogError}</p> : null}

            <div className="rule-code-strip">
              <span>规则码</span>
              <b>{ruleCode}</b>
              <small>规则码用于核对同一届：朋友双方看到的规则码和 Seed 都一样，抽签才会完全一致。</small>
            </div>

            <FilterBlock title="赛事预设" className="preset-filter">
              {rulePresets.map((preset) => (
                <button type="button" className="preset-chip" key={preset.id} onClick={() => applyPreset(preset)}>
                  <b>{preset.title}</b>
                  <span>{preset.desc}</span>
                </button>
              ))}
            </FilterBlock>

            <FilterBlock title="分类" className="category-filter">
              {categories.map((category) => (
                <Chip
                  key={category}
                  active={filters.categories.includes(category)}
                  onClick={() => setFilters({ ...filters, categories: toggleValue(filters.categories, category) })}
                >
                  {category}
                </Chip>
              ))}
            </FilterBlock>

            <FilterBlock title="版本" className="version-filter">
              {versions.map((version) => (
                <Chip
                  key={version}
                  active={filters.versions.includes(version)}
                  onClick={() => setFilters({ ...filters, versions: toggleValue(filters.versions, version) })}
                >
                  {version}
                </Chip>
              ))}
            </FilterBlock>

            {filters.mode === "chart" ? (
              <>
                <FilterBlock title="难度" className="difficulty-filter">
                  {difficulties.map((difficulty) => (
                    <Chip
                      key={difficulty}
                      active={filters.difficulties.includes(difficulty)}
                      onClick={() =>
                        setFilters({
                          ...filters,
                          difficulties: [difficulty]
                        })
                      }
                    >
                      {difficulty}
                    </Chip>
                  ))}
                </FilterBlock>
                <p className="filter-hint">谱面杯固定同难度对决：红谱只会遇到红谱，紫谱只会遇到紫谱。</p>

                <div className="range-mode" role="group" aria-label="谱面范围筛选方式">
                  <button
                    type="button"
                    className={filters.rangeMode === "level" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, rangeMode: "level" })}
                  >
                    按等级
                  </button>
                  <button
                    type="button"
                    className={filters.rangeMode === "constant" ? "active" : ""}
                    disabled={!constantBounds}
                    onClick={() => setFilters({ ...filters, rangeMode: "constant" })}
                  >
                    按定数
                  </button>
                </div>
                {!constantBounds ? (
                  <p className="filter-hint subtle-hint">当前曲库没有 constant 字段，因此暂不可按定数筛选；等级筛选仍可正常使用。</p>
                ) : null}

                {filters.rangeMode === "level" ? (
                  <div className="range-grid">
                    <label>
                      等级下限
                      <select
                        value={filters.minLevel}
                        onChange={(event) =>
                          setFilters((current) => normalizeLevelRange({ ...current, minLevel: event.target.value }))
                        }
                      >
                        {levelOptions.map((level) => (
                          <option key={level} value={level}>
                            Lv {level}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      等级上限
                      <select
                        value={filters.maxLevel}
                        onChange={(event) =>
                          setFilters((current) => normalizeLevelRange({ ...current, maxLevel: event.target.value }))
                        }
                      >
                        {levelOptions.map((level) => (
                          <option key={level} value={level}>
                            Lv {level}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="range-grid constant-range">
                    <label>
                      定数下限
                      <input
                        type="number"
                        inputMode="decimal"
                        min={constantBounds?.min ?? 1}
                        max={filters.maxConstant}
                        step="0.1"
                        value={filters.minConstant}
                        onChange={(event) =>
                          setFilters((current) => ({ ...current, minConstant: Math.min(Number(event.target.value), current.maxConstant) }))
                        }
                      />
                    </label>
                    <label>
                      定数上限
                      <input
                        type="number"
                        inputMode="decimal"
                        min={filters.minConstant}
                        max={constantBounds?.max ?? 15}
                        step="0.1"
                        value={filters.maxConstant}
                        onChange={(event) =>
                          setFilters((current) => ({ ...current, maxConstant: Math.max(Number(event.target.value), current.minConstant) }))
                        }
                      />
                    </label>
                  </div>
                )}
                <p className="filter-hint subtle-hint">
                  等级始终按曲库原字段显示，例如「13+」不会改写成小数；定数只用于内部筛选。
                </p>
              </>
            ) : null}

            <details className="advanced-block">
              <summary>高级 · 种子与分享</summary>
              <div className="seed-field">
                <label htmlFor="cup-seed">Seed 是抽签随机源；规则码是当前模式和筛选的校验码</label>
                <div className="seed-row">
                  <input
                    id="cup-seed"
                    name="cup-seed"
                    type="text"
                    value={seedDraft}
                    onChange={(event) => setSeedDraft(event.target.value)}
                    onBlur={() => setSeedDraft(readSeed())}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="例如 maimai-cup"
                  />
                  <button
                    type="button"
                    className="ghost-action"
                    onClick={() => {
                      const next = randomSeed();
                      setSeedDraft(next);
                      setFilters((current) => ({ ...current, seed: next }));
                    }}
                  >
                    <Dices size={16} />
                    随机
                  </button>
                  <button type="button" className="ghost-action" onClick={copySeedLink}>
                    <Copy size={16} />
                    {seedCopyState === "success" ? "已复制" : "复制配置"}
                  </button>
                  <button type="button" className="ghost-action" onClick={copyAutoDrawLink}>
                    <Link size={16} />
                    {autoLinkCopyState === "success" ? "已复制" : "复制抽签链接"}
                  </button>
                </div>
                <p className="seed-help">
                  复制配置：朋友打开后看到同一套配置，需要自己点开始抽签。复制抽签链接：朋友打开后会自动进入同一份小组抽签结果。只口头报 Seed 不够，还要核对规则码。
                </p>
                {seedCopyState === "error" || autoLinkCopyState === "error" ? <p className="form-error">复制失败，请手动复制地址栏链接。</p> : null}
              </div>
            </details>

            <button className="primary-action" onClick={() => startDraw(readSeed())} disabled={!canStart}>
              <Dices size={20} />
              {catalogLoading ? "曲库加载中…" : "开始抽签 48 强"}
            </button>
            {drawError ? <p className="form-error" role="alert">{drawError}</p> : null}
          </div>

          <div className="preview-grid">
            <LibraryPrefs favoriteCount={favoriteSongIds.length} excludedCount={excludedSongIds.length} onClearExcluded={() => setExcludedSongIds([])} />
            {pool.slice(0, 6).map((entry, index) => (
              <div className="stagger-item" style={{ ["--stagger" as string]: `${index * 55}ms` }} key={entry.id}>
                <SongCard entry={entry} mode="compact" />
              </div>
            ))}
            <PreviewEntryManager
              entries={pool.slice(0, 6)}
              favoriteSongIds={favoriteSongIds}
              excludedSongIds={excludedSongIds}
              onFavorite={toggleFavorite}
              onExclude={toggleExcluded}
            />
            <div className="config-archives">
              <ArchiveStrip archives={archives} />
            </div>
          </div>
        </section>
      ) : null}

      {phase === "draw" ? (
        <section className="stage phase-panel">
          <StageHeader
            icon={<Dices size={19} />}
            title={`${modeLabel} / 小组抽签`}
            subtitle={`48 个唯一${filters.mode === "song" ? "歌曲" : "谱面"}分为 12 组，每组 4 个；相同参赛项绝不重复。`}
            meta={cupMeta}
            actions={
              <>
                <button className="ghost-action" onClick={resetAll}>
                  <ArrowLeft size={17} />
                  返回配置
                </button>
                <button className="ghost-action" onClick={() => startDraw(randomSeed())}>
                  <RefreshCw size={17} />
                  重新抽签
                </button>
                <button className="primary-inline" onClick={startGroups}>
                  <Flag size={17} />
                  开始小组赛
                </button>
              </>
            }
          />
          <div className="draw-grid">
            {groups.map((group, index) => (
              <div className="group-box" style={{ ["--stagger" as string]: `${index * 65}ms` }} key={index}>
                <div className="group-name">GROUP {String.fromCharCode(65 + index)}</div>
                {group.map((entry, entryIndex) => (
                  <div className="draw-row" style={{ ["--row-stagger" as string]: `${entryIndex * 45}ms` }} key={entry.id}>
                    <img src={entry.jacket} alt="" onError={useFallbackJacket} />
                    <span>{entry.title}</span>
                    {entry.chart ? <b>{entry.chart.difficulty} · {entry.chart.level}</b> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {phase === "groups" ? (
        <section className="stage phase-panel">
          <StageHeader
            icon={<Flag size={19} />}
            title={`${modeLabel} / 小组赛 / GROUP ${String.fromCharCode(65 + groupIndex)}`}
            subtitle={`选择 2 个直通项。已完成 ${groupIndex} / ${groups.length} 组。`}
            meta={cupMeta}
          />
          <ProgressBar value={groupIndex} max={groups.length} />
          <div className="selection-status" role="status">
            <span>本组直通</span>
            <strong>{groupSelection.length}<small>/2</small></strong>
            <p>{groupSelection.length === 2 ? "已选满，可以锁定晋级名单" : `再选择 ${2 - groupSelection.length} 个参赛项`}</p>
          </div>
          <div className="battle-grid four">
            {currentGroup.map((entry, index) => (
              <div className="stagger-item" style={{ ["--stagger" as string]: `${index * 80}ms` }} key={entry.id}>
                <SongCard
                  entry={entry}
                  selected={groupSelection.includes(entry.id)}
                  disabled={groupSelection.length >= 2 && !groupSelection.includes(entry.id)}
                  onSelect={toggleGroupPick}
                />
              </div>
            ))}
          </div>
          <div className="sticky-confirm">
            <button className="primary-action narrow" disabled={groupSelection.length !== 2} onClick={confirmGroup}>
              <CheckCircle2 size={18} />
              锁定直通名额 · {groupSelection.length}/2
            </button>
          </div>
        </section>
      ) : null}

      {phase === "revival" ? (
        <section className="stage phase-panel">
          <StageHeader
            icon={<RotateCcw size={19} />}
            title={`${modeLabel} / 复活赛`}
            subtitle={`从 ${eliminated.length} 个落选项中选择 8 个，组成 32 强。`}
            meta={cupMeta}
          />
          <ProgressBar value={revivalSelection.length} max={8} />
          <div className="selection-status revival-count" role="status">
            <span>复活名额</span>
            <strong>{revivalSelection.length}<small>/8</small></strong>
            <p>{revivalSelection.length === 8 ? "复活名单待公布" : `还可选择 ${8 - revivalSelection.length} 个谱面或歌曲`}</p>
          </div>
          {revivalSelection.length === 8 ? (
            <div className="revival-ceremony">
              <div className="section-title">
                <Sparkles size={18} />
                复活名单
              </div>
              <div className="revival-lineup">
                {revivalPicks.map((entry, index) => (
                  <div className={`revival-ticket ${index < revivalRevealCount ? "revealed" : ""}`} key={entry.id}>
                    {index < revivalRevealCount ? (
                      <>
                        <img src={entry.jacket} alt="" onError={useFallbackJacket} />
                        <span>{entry.title}</span>
                      </>
                    ) : (
                      <span>WAITING</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="battle-grid revival">
            {eliminated.map((entry, index) => (
              <div className="stagger-item" style={{ ["--stagger" as string]: `${Math.min(index, 16) * 28}ms` }} key={entry.id}>
                <SongCard
                  entry={entry}
                  mode="compact"
                  selected={revivalSelection.includes(entry.id)}
                  disabled={revivalSelection.length >= 8 && !revivalSelection.includes(entry.id)}
                  onSelect={toggleRevivalPick}
                />
              </div>
            ))}
          </div>
          <div className="sticky-confirm">
            {revivalSelection.length === 8 && revivalRevealCount < 8 ? (
              <button className="primary-action narrow" onClick={revealRevivalLineup}>
                <Sparkles size={18} />
                公布 8 个复活名额
              </button>
            ) : (
              <button className="primary-action narrow" disabled={revivalSelection.length !== 8 || revivalRevealCount < 8} onClick={startBracket}>
                <Swords size={18} />
                进入 32 强淘汰赛 · {revivalSelection.length}/8
              </button>
            )}
          </div>
        </section>
      ) : null}

      {phase === "bracket" ? (
        <section className="stage phase-panel bracket-panel">
          <StageHeader
            icon={<Swords size={19} />}
            title={`${modeLabel} / ${currentRoundName} / MATCH ${matchIndex + 1}`}
            subtitle={`本轮 ${matchIndex + 1} / ${roundEntries.length / 2} 场，累计完成 ${history.length} 场。`}
            meta={cupMeta}
            actions={
              <button className="ghost-action" onClick={undoLastMatch} disabled={undoStack.length === 0}>
                <RotateCcw size={17} />
                撤销上一场
              </button>
            }
          />
          <ProgressBar value={matchIndex} max={roundEntries.length / 2} />
          <RoundRoadmap currentRound={currentRoundName} history={history} />
          <div className="duel-prompt" role="status">点击一侧卡片，送它晋级下一轮。键盘：A 左 / D 右 / 1-2 试听 / 空格停止。</div>
          <div className="duel-toolbar">
            {currentMatch.map((entry, index) => (
              <button type="button" className="ghost-action" key={entry.id} disabled={!entry.previewAudio} onClick={() => playDuelPreview(entry)}>
                <Volume2 size={16} />
                {duelPreviewingId === entry.id ? "试听中" : `试听${index === 0 ? "左侧" : "右侧"}`}
              </button>
            ))}
            <button type="button" className="ghost-action" onClick={stopDuelPreview} disabled={!duelPreviewingId}>
              暂停试听
            </button>
            <button type="button" className="ghost-action" onClick={playRandomDuelPreview}>
              <Dices size={16} />
              随机试听
            </button>
            <button type="button" className={`ghost-action ${duelBlindMode ? "active-soft" : ""}`} onClick={() => setDuelBlindMode((value) => !value)}>
              纠结盲选
            </button>
          </div>
          <div className={`duel-zone ${duelBlindMode ? "is-blind" : ""}`}>
            {currentMatch.map((entry, index) => (
              <div className={`duel-slot side-${index + 1}`} key={entry.id}>
                <SongCard entry={entry} mode="duel" onSelect={chooseWinner} />
              </div>
            ))}
            <div className="vs-badge">VS</div>
          </div>
          <BracketTrail history={history} />
        </section>
      ) : null}

      {phase === "result" && champion ? (
        <section className="stage phase-panel result-stage">
          <PosterThemePicker value={posterTheme} onChange={setPosterTheme} />
          <SharePoster
            captureRef={resultRef}
            champion={champion}
            runnerUp={finalRecord?.loser}
            topFour={topFour}
            championPath={championPath}
            history={history}
            modeLabel={modeLabel}
            seed={filters.seed}
            ruleCode={ruleCode}
            theme={posterTheme}
          />
          <ResultStatsPanel stats={tournamentStats} />
          <ArchiveStrip archives={archives} />
          <div className="result-actions">
            <button className="primary-inline" onClick={downloadShareImage} disabled={captureState === "working"}>
              <Camera size={17} />
              {captureState === "working" ? "正在生成…" : captureState === "success" ? "已生成 PNG" : "生成分享截图"}
            </button>
            <button className="ghost-action" onClick={resetAll}>
              <RefreshCw size={17} />
              重新开始
            </button>
            {captureState === "error" ? <p className="capture-error" role="alert">截图生成失败，请确认曲绘均已加载后重试。</p> : null}
          </div>
        </section>
      ) : null}
      </div>
    </main>
  );
}

const phaseOrder: Phase[] = ["config", "draw", "groups", "revival", "bracket", "result"];

function CupStepper({ phase }: { phase: Phase }) {
  const current = phaseOrder.indexOf(phase);
  return (
    <nav className="cup-stepper" aria-label="赛事流程">
      {phaseOrder.map((item, index) => (
        <div className={`${index === current ? "current" : ""} ${index < current ? "done" : ""}`} key={item}>
          <span>{index < current ? <CheckCircle2 size={14} /> : index + 1}</span>
          <b>{phaseLabel(item)}</b>
        </div>
      ))}
    </nav>
  );
}

function RoundRoadmap({ currentRound, history }: { currentRound: string; history: MatchRecord[] }) {
  const rounds = ["32 强", "16 强", "8 强", "半决赛", "决赛"];
  const current = rounds.indexOf(currentRound);
  return (
    <div className="round-roadmap" aria-label="淘汰赛晋级路径">
      {rounds.map((round, index) => (
        <div className={`${index === current ? "current" : ""} ${index < current ? "done" : ""}`} key={round}>
          <span>{round}</span>
          <small>{history.filter((record) => record.round === round).length}/{16 / 2 ** index}</small>
        </div>
      ))}
    </div>
  );
}

function StageHeader({
  icon,
  title,
  subtitle,
  meta,
  actions
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="stage-header">
      <div>
        <div className="section-title">
          {icon}
          {title}
        </div>
        {meta ? <div className="stage-meta">{meta}</div> : null}
        <p>{subtitle}</p>
      </div>
      {actions ? <div className="stage-actions">{actions}</div> : null}
    </div>
  );
}

function StageIntro({ intro }: { intro: ReturnType<typeof getStageIntro> }) {
  const [visible, setVisible] = useState(Boolean(intro));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setVisible(Boolean(intro));
    setLeaving(false);
    if (!intro) return;
    const duration = intro.variant === "champion" ? 7200 : 6200;
    const leaveTimer = window.setTimeout(() => setLeaving(true), duration - 520);
    const hideTimer = window.setTimeout(() => setVisible(false), duration);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [intro?.key]);

  if (!intro || !visible) return null;

  return (
    <div className={`stage-intro intro-${intro.variant} ${leaving ? "is-leaving" : ""}`} key={intro.key} role="status" aria-live="polite">
      <div className="stage-intro-inner">
        <span className="stage-intro-orbit" aria-hidden="true" />
        <span className="stage-intro-en">{intro.en}</span>
        <strong className="stage-intro-title">{intro.title}</strong>
        <span className="stage-intro-desc">{intro.desc}</span>
        <button type="button" className="intro-skip" onClick={() => setVisible(false)}>进入本轮</button>
        <span className="stage-intro-timer" aria-hidden="true" />
      </div>
    </div>
  );
}

function SharePoster({
  captureRef,
  champion,
  runnerUp,
  topFour,
  championPath,
  history,
  modeLabel,
  seed,
  ruleCode,
  theme
}: {
  captureRef: RefObject<HTMLDivElement>;
  champion: CupEntry;
  runnerUp?: CupEntry;
  topFour: CupEntry[];
  championPath: MatchRecord[];
  history: MatchRecord[];
  modeLabel: string;
  seed: string;
  ruleCode: string;
  theme: PosterTheme;
}) {
  return (
    <div className={`share-poster poster-theme-${theme}`} ref={captureRef}>
      <div className="poster-header">
        <div className="poster-kicker"><span>OFFICIAL RESULT</span><b>48 → 1</b></div>
        <p>MAIMAI CUP</p>
        <h2>{modeLabel} · 舞萌本命之巅</h2>
        <div className="poster-meta-line">
          <span className="poster-seed">SEED · {seed || "maimai-cup"}</span>
          <span>{ruleCode}</span>
          <span>32 强完整晋级表</span>
        </div>
      </div>

      <div className="poster-layout">
        <BracketSide side="left" history={history} champion={champion} />

        <div className="poster-champion">
          <div className="champion-art">
            <img src={champion.jacket} alt={`${champion.title} jacket`} onError={useFallbackJacket} />
            <span className="champion-crown">
              <Crown size={22} />
            </span>
          </div>
          <div className="champion-ribbon">冠军 · CHAMPION</div>
          <h3>{champion.title}</h3>
          <p>{champion.artist}</p>
          {champion.chart ? (
            <div className="champion-chart">
              {champion.chart.difficulty} / {chartTypeLabel(champion.chart.type, champion.songId)} / Lv {champion.chart.level}
              {typeof champion.chart.constant === "number" ? ` / 定数 ${champion.chart.constant.toFixed(1)}` : ""}
              {champion.chart.designer ? ` / 谱师 ${champion.chart.designer}` : ""}
            </div>
          ) : null}
          {runnerUp ? (
            <div className="runner-up">
              <img src={runnerUp.jacket} alt="" onError={useFallbackJacket} />
              <span>亚军 · RUNNER-UP<b>{runnerUp.title}</b></span>
            </div>
          ) : null}
        </div>

        <BracketSide side="right" history={history} champion={champion} />
      </div>

      <div className="poster-footer">
        <div className="poster-topfour">
          <span>FINAL FOUR · 四强</span>
          {topFour.slice(0, 4).map((entry) => (
            <div className="poster-finisher" key={entry.id}>
              <img src={entry.jacket} alt="" onError={useFallbackJacket} />
              <b>{entry.title}</b>
            </div>
          ))}
        </div>
        <div className="poster-path">
          <span>ROAD TO CHAMPION · 冠军路径</span>
          {championPath.map((record) => (
            <b key={`${record.round}-${record.matchNumber}`}><small>{record.round}</small>{record.loser.title}</b>
          ))}
        </div>
      </div>

      <details className="mobile-bracket-details">
        <summary>
          <span>完整 32 强晋级表</span>
          <b>展开查看</b>
        </summary>
        <p>左右滑动可查看每轮对阵与晋级结果</p>
        <div className="mobile-bracket-scroll">
          <BracketSide side="left" history={history} champion={champion} />
          <BracketSide side="right" history={history} champion={champion} />
        </div>
      </details>

      <div className="poster-domain"><span>MAIMAI MUSIC TOURNAMENT</span><b>maimai.utautai.org</b></div>
    </div>
  );
}

function BracketSide({ side, history, champion }: { side: "left" | "right"; history: MatchRecord[]; champion: CupEntry }) {
  const rounds = side === "left" ? ["32 强", "16 强", "8 强", "半决赛"] : ["半决赛", "8 强", "16 强", "32 强"];
  return (
    <div className={`poster-bracket poster-bracket-${side}`}>
      {rounds.map((round) => {
        const visible = getSideMatches(history, round, side);
        return (
          <div className="poster-round" key={`${side}-${round}`}>
            <span className="poster-round-name">{round}</span>
            {visible.map((record) => (
              <div
                className={`poster-match ${record.winner.id === champion.id ? "champion-line" : ""}`}
                key={`${side}-${round}-${record.matchNumber}`}
              >
                <MiniEntry entry={record.winner} winner />
                <MiniEntry entry={record.loser} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function getSideMatches(history: MatchRecord[], round: string, side: "left" | "right") {
  const matches = history.filter((record) => record.round === round).sort((a, b) => a.matchNumber - b.matchNumber);
  const half = matches.length / 2;
  return side === "left" ? matches.filter((record) => record.matchNumber <= half) : matches.filter((record) => record.matchNumber > half);
}

function MiniEntry({ entry, winner }: { entry: CupEntry; winner?: boolean }) {
  return (
    <div className={`mini-entry ${winner ? "winner" : ""}`}>
      <img src={entry.jacket} alt="" onError={useFallbackJacket} />
      <span>{entry.title}</span>
    </div>
  );
}

function FilterBlock({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={`filter-block ${className}`}>
      <div className="filter-title">{title}</div>
      <div className="chip-row">{children}</div>
    </div>
  );
}

function EntryToggles({
  entry,
  favorite,
  excluded,
  onFavorite,
  onExclude
}: {
  entry: CupEntry;
  favorite: boolean;
  excluded: boolean;
  onFavorite: (entry: CupEntry) => void;
  onExclude: (entry: CupEntry) => void;
}) {
  return (
    <div className="entry-toggles">
      <button type="button" className={favorite ? "active" : ""} onClick={() => onFavorite(entry)}>
        <Heart size={14} />
        {favorite ? "已收藏" : "收藏"}
      </button>
      <button type="button" className={excluded ? "danger active" : "danger"} onClick={() => onExclude(entry)}>
        {excluded ? "已排除" : "排除"}
      </button>
    </div>
  );
}

function LibraryPrefs({ favoriteCount, excludedCount, onClearExcluded }: { favoriteCount: number; excludedCount: number; onClearExcluded: () => void }) {
  return (
    <div className="library-prefs">
      <span><Heart size={14} /> 本地收藏 {favoriteCount}</span>
      <span>本地排除 {excludedCount}</span>
      {excludedCount ? <button type="button" onClick={onClearExcluded}>清空排除</button> : null}
    </div>
  );
}

function PreviewEntryManager({
  entries,
  favoriteSongIds,
  excludedSongIds,
  onFavorite,
  onExclude
}: {
  entries: CupEntry[];
  favoriteSongIds: string[];
  excludedSongIds: string[];
  onFavorite: (entry: CupEntry) => void;
  onExclude: (entry: CupEntry) => void;
}) {
  if (!entries.length) return null;
  return (
    <details className="preview-manager">
      <summary>管理当前预览曲目</summary>
      <div className="preview-manager-list">
        {entries.map((entry) => (
          <div className="preview-manager-row" key={entry.id}>
            <img src={entry.jacket} alt="" onError={useFallbackJacket} />
            <span>{entry.title}</span>
            <EntryToggles
              entry={entry}
              favorite={favoriteSongIds.includes(entry.songId)}
              excluded={excludedSongIds.includes(entry.songId)}
              onFavorite={onFavorite}
              onExclude={onExclude}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

function PosterThemePicker({ value, onChange }: { value: PosterTheme; onChange: (theme: PosterTheme) => void }) {
  return (
    <div className="poster-theme-picker">
      <div className="section-title">
        <Camera size={18} />
        海报模板
      </div>
      <div className="theme-row">
        {posterThemes.map((theme) => (
          <button type="button" className={theme.id === value ? "active" : ""} key={theme.id} onClick={() => onChange(theme.id)}>
            {theme.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultStatsPanel({ stats }: { stats: TournamentStats }) {
  return (
    <section className="result-stats">
      <div className="section-title">
        <BarChart3 size={18} />
        赛后统计
      </div>
      <div className="stats-grid">
        <StatTile label="完成对局" value={`${stats.matchCount} 场`} />
        <StatTile label="版本势力" value={stats.versionLeader} />
        <StatTile label="分类势力" value={stats.categoryLeader} />
        <StatTile label="最高定数" value={stats.highestConstant} />
      </div>
      <div className="stats-notes">
        <span>冠军路径</span>
        <b>{stats.championPathText}</b>
      </div>
      {stats.defeatedDesigners.length ? (
        <div className="stats-notes">
          <span>击败谱师</span>
          <b>{stats.defeatedDesigners.join(" / ")}</b>
        </div>
      ) : null}
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ArchiveStrip({ archives }: { archives: TournamentArchive[] }) {
  if (!archives.length) return null;
  return (
    <section className="archive-strip">
      <div className="section-title">
        <Archive size={18} />
        最近赛事
      </div>
      <div className="archive-row">
        {archives.slice(0, 6).map((item) => (
          <article className="archive-card" key={item.id}>
            <img src={item.championJacket} alt="" onError={useFallbackJacket} />
            <div>
              <span>{item.modeLabel} · {item.ruleCode}</span>
              <b>{item.championTitle}</b>
              <small>{formatArchiveTime(item.createdAt)} / Seed {item.seed}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="progress-shell" aria-label={`progress ${value} of ${max}`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function BracketTrail({ history }: { history: MatchRecord[] }) {
  const recent = history.slice(-8).reverse();
  return (
    <div className="bracket-trail">
      <h3>晋级路径</h3>
      <div className="trail-grid">
        {recent.length === 0 ? <p className="empty-trail">第一场对决等待判定。</p> : null}
        {recent.map((record) => (
          <p key={`${record.round}-${record.matchNumber}-${record.winner.id}`}>
            <span>{record.round}</span>
            {record.winner.title} / over {record.loser.title}
          </p>
        ))}
      </div>
    </div>
  );
}

function toggleValue<T>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function uniqueEntries(items: CupEntry[]) {
  return items.filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index);
}

function buildTournamentStats(entries: CupEntry[], history: MatchRecord[], champion: CupEntry | null): TournamentStats {
  const uniqueEntryList = uniqueEntries(entries);
  const categoryLeader = topCountLabel(uniqueEntryList.map((entry) => entry.category));
  const versionLeader = topCountLabel(uniqueEntryList.map((entry) => entry.version));
  const constants = uniqueEntryList
    .map((entry) => entry.chart?.constant)
    .filter(isNumber);
  const championPath = champion ? history.filter((record) => record.winner.id === champion.id) : [];
  const defeatedDesigners = unique(
    championPath
      .map((record) => record.loser.chart?.designer?.trim())
      .filter((designer): designer is string => typeof designer === "string" && designer.length > 0 && !["-", "maimaiNET"].includes(designer))
  ).slice(0, 6);

  return {
    matchCount: history.length,
    categoryLeader,
    versionLeader,
    highestConstant: constants.length ? constants.reduce((max, value) => Math.max(max, value), 0).toFixed(1) : "无",
    defeatedDesigners,
    championPathText: championPath.length
      ? championPath.map((record) => `${record.round}胜 ${record.loser.title}`).join(" / ")
      : "暂无"
  };
}

function topCountLabel(values: string[]) {
  if (!values.length) return "暂无";
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return `${name} · ${count}`;
}

function makeRuleCode(filters: CupFilters) {
  return `规则码 ${shortHash(drawSeedFor(filters))}`;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function loadLocalArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveLocalArray(key: string, value: string[]) {
  localStorage.setItem(key, JSON.stringify(unique(value).slice(0, 500)));
}

function loadLocalValue(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function loadArchives() {
  try {
    const value = JSON.parse(localStorage.getItem("mmc-tournament-archives") || "[]");
    return Array.isArray(value) ? (value as TournamentArchive[]) : [];
  } catch {
    return [];
  }
}

function saveArchives(value: TournamentArchive[]) {
  localStorage.setItem("mmc-tournament-archives", JSON.stringify(value));
  return value;
}

function formatArchiveTime(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeLevelRange(filters: CupFilters) {
  if (compareLevel(filters.minLevel, filters.maxLevel) <= 0) {
    return filters;
  }

  return {
    ...filters,
    minLevel: filters.maxLevel,
    maxLevel: filters.minLevel
  };
}

function isEntry(entry: CupEntry | undefined): entry is CupEntry {
  return Boolean(entry);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createDefaultFilters(): CupFilters {
  if (typeof window === "undefined") {
    return fallbackFilters;
  }

  const params = new URLSearchParams(window.location.search);
  const mode: CupFilters["mode"] = params.get("mode") === "chart" ? "chart" : "song";
  const difficulty = parseDifficulty(params.get("difficulty"));
  const rangeMode: CupFilters["rangeMode"] = params.get("range") === "constant" ? "constant" : "level";

  return {
    ...fallbackFilters,
    mode,
    categories: params.getAll("category").map(normalizeLooseValue).filter(Boolean),
    versions: params.getAll("version").map(normalizeLooseValue).filter(Boolean),
    difficulties: mode === "chart" ? [difficulty] : fallbackFilters.difficulties,
    rangeMode,
    minLevel: normalizeLevelParam(params.get("minLevel"), fallbackFilters.minLevel),
    maxLevel: normalizeLevelParam(params.get("maxLevel"), fallbackFilters.maxLevel),
    minConstant: normalizeNumberParam(params.get("minConstant"), fallbackFilters.minConstant),
    maxConstant: normalizeNumberParam(params.get("maxConstant"), fallbackFilters.maxConstant),
    seed: normalizeSeed(params.get("seed") || fallbackFilters.seed)
  };
}

function buildCupUrl(filters: CupFilters, options: { autoDraw?: boolean } = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mode", filters.mode);
  url.searchParams.set("seed", normalizeSeed(filters.seed));
  if (options.autoDraw) {
    url.searchParams.set("auto", "draw");
  }
  filters.categories.forEach((category) => url.searchParams.append("category", category));
  filters.versions.forEach((version) => url.searchParams.append("version", version));

  if (filters.mode === "chart") {
    url.searchParams.set("difficulty", filters.difficulties[0] || "Expert");
    url.searchParams.set("range", filters.rangeMode);
    if (filters.rangeMode === "constant") {
      url.searchParams.set("minConstant", String(filters.minConstant));
      url.searchParams.set("maxConstant", String(filters.maxConstant));
    } else {
      url.searchParams.set("minLevel", filters.minLevel);
      url.searchParams.set("maxLevel", filters.maxLevel);
    }
  }

  return url.toString();
}

function syncCupUrl(filters: CupFilters) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", buildCupUrl(filters));
}

function drawSeedFor(filters: CupFilters) {
  return JSON.stringify({
    seed: normalizeSeed(filters.seed),
    mode: filters.mode,
    categories: [...filters.categories].sort(),
    versions: [...filters.versions].sort(),
    difficulty: filters.mode === "chart" ? filters.difficulties[0] : "song",
    rangeMode: filters.mode === "chart" ? filters.rangeMode : "song",
    minLevel: filters.mode === "chart" && filters.rangeMode === "level" ? filters.minLevel : "",
    maxLevel: filters.mode === "chart" && filters.rangeMode === "level" ? filters.maxLevel : "",
    minConstant: filters.mode === "chart" && filters.rangeMode === "constant" ? filters.minConstant : "",
    maxConstant: filters.mode === "chart" && filters.rangeMode === "constant" ? filters.maxConstant : ""
  });
}

function normalizeSeed(value: string) {
  return normalizeLooseValue(value).replace(/\s+/g, "-").toUpperCase().slice(0, 48) || randomSeed();
}

function normalizeLooseValue(value: string | null) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizeLevelParam(value: string | null, fallback: string) {
  const normalized = normalizeLooseValue(value);
  return /^\d{1,2}\+?$/.test(normalized) ? normalized : fallback;
}

function normalizeNumberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 20 ? parsed : fallback;
}

function parseDifficulty(value: string | null): Difficulty {
  const normalized = normalizeLooseValue(value) as Difficulty;
  return difficulties.includes(normalized) ? normalized : "Expert";
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy failed");
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function useFallbackJacket(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (!image.src.endsWith("/assets/jacket-fallback.svg")) {
    image.src = "/assets/jacket-fallback.svg";
  }
}

function phaseLabel(phase: Phase) {
  const labels: Record<Phase, string> = {
    config: "配置",
    draw: "抽签",
    groups: "小组赛",
    revival: "复活赛",
    bracket: "淘汰赛",
    result: "结果"
  };
  return labels[phase];
}

function cupModeLabel(mode: CupFilters["mode"]) {
  return mode === "song" ? "歌曲杯" : "谱面杯";
}

function chartTypeLabel(type: string | undefined, songId: string) {
  if (type === "standard") return "SD谱";
  if (type === "dx") return "DX谱";
  if (/^jp-00\d+/.test(songId)) return "SD谱";
  return "DX谱";
}

type IntroVariant = "normal" | "semi" | "final" | "champion";

function getStageIntro(
  phase: Phase,
  roundSize: number
): { key: string; en: string; title: string; desc: string; variant: IntroVariant } | null {
  if (phase === "draw") {
    return { key: "draw", en: "DRAW", title: "抽签", desc: "48 首本命随机分入 12 组，同一首歌不会重复出现。", variant: "normal" };
  }
  if (phase === "groups") {
    return { key: "groups", en: "GROUP STAGE", title: "小组赛", desc: "每组 4 首，你选 2 首直通，另外 2 首落入待复活区。", variant: "normal" };
  }
  if (phase === "revival") {
    return { key: "revival", en: "REVIVAL", title: "复活赛", desc: "从落选的 24 首里捞回 8 首，凑齐 32 强。", variant: "normal" };
  }
  if (phase === "result") {
    return { key: "result", en: "CHAMPION", title: "冠军诞生", desc: "这就是你的年度本命之巅，截图分享给同好。", variant: "champion" };
  }
  if (phase === "bracket") {
    switch (roundSize) {
      case 32:
        return { key: "r32", en: "ROUND OF 32", title: "32 强", desc: "单败淘汰开始，每场只有一首能活下来。", variant: "normal" };
      case 16:
        return { key: "r16", en: "ROUND OF 16", title: "16 强", desc: "半数出局，你的本命还在名单里吗？", variant: "normal" };
      case 8:
        return { key: "r8", en: "QUARTER FINAL", title: "8 强", desc: "只剩八首，每一票都在改写结局。", variant: "normal" };
      case 4:
        return { key: "r4", en: "SEMI FINAL", title: "半决赛", desc: "四进二，决赛门票近在眼前。", variant: "semi" };
      case 2:
        return { key: "r2", en: "FINAL", title: "决赛", desc: "最后两首，选出你的本命之巅。", variant: "final" };
      default:
        return { key: `r${roundSize}`, en: "BATTLE", title: `${roundSize} 强`, desc: "选出你更爱的一首。", variant: "normal" };
    }
  }
  return null;
}
