import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Crown,
  Dices,
  Flag,
  Gauge,
  Music2,
  RefreshCw,
  RotateCcw,
  Swords,
  Trophy,
  Zap
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SongCard } from "./components/SongCard";
import { songs, usingImportedSongs } from "./data/songs";
import { compareLevel, getRoundName, makeGroups, shuffleWithSeed, toCupEntries } from "./lib/tournament";
import { CupEntry, CupFilters, Difficulty, MatchRecord } from "./types";

type Phase = "config" | "draw" | "groups" | "revival" | "bracket" | "result";

type BracketSnapshot = {
  roundEntries: CupEntry[];
  roundWinners: CupEntry[];
  matchIndex: number;
  history: MatchRecord[];
};

const difficulties: Difficulty[] = ["Basic", "Advanced", "Expert", "Master", "Re:Master"];
const defaultFilters: CupFilters = {
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

export default function App() {
  const [phase, setPhase] = useState<Phase>("config");
  const [filters, setFilters] = useState<CupFilters>(defaultFilters);
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
  const resultRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => unique(songs.map((song) => song.category)), []);
  const versions = useMemo(() => unique(songs.map((song) => song.version)), []);
  const levelOptions = useMemo(
    () => unique(songs.flatMap((song) => song.charts.map((chart) => chart.level))).sort(compareLevel),
    []
  );
  const constantBounds = useMemo(() => {
    const values = songs.flatMap((song) => song.charts.map((chart) => chart.constant)).filter(isNumber);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  }, []);
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
  const pool = useMemo(() => toCupEntries(songs, filters), [filters]);
  const uniquePoolEntries = useMemo(() => new Set(pool.map((entry) => entry.id)).size, [pool]);
  const canStart = uniquePoolEntries >= 48;
  const modeLabel = cupModeLabel(filters.mode);
  const difficultyModeText =
    filters.mode === "chart"
      ? `${filters.difficulties[0] ?? "Expert"} / ${filters.rangeMode === "level" ? `Lv ${filters.minLevel}–${filters.maxLevel}` : `定数 ${filters.minConstant.toFixed(1)}–${filters.maxConstant.toFixed(1)}`}`
      : "歌曲本体 · 不区分难度";
  const cupMeta = `${modeLabel} / ${usingImportedSongs ? "JP 曲库" : "Mock 曲库"} / Seed ${filters.seed || "maimai-cup"}`;
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

  function startDraw(seed = filters.seed) {
    const seededFilters = { ...filters, seed };
    const entries = toCupEntries(songs, seededFilters);
    const nextGroups = makeGroups(entries, seed);
    const drawn = nextGroups.flat();

    if (drawn.length !== 48 || new Set(drawn.map((entry) => entry.id)).size !== 48) {
      setDrawError("当前筛选不足 48 个唯一参赛项，请放宽筛选条件后重试。");
      return;
    }

    setDrawError("");
    setFilters(seededFilters);
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
    setPhase("draw");
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

  function startBracket() {
    if (revivalSelection.length !== 8) {
      return;
    }
    const revived = eliminated.filter((entry) => revivalSelection.includes(entry.id));
    const top32 = shuffleWithSeed([...qualified, ...revived], `${filters.seed}-top32`);
    setRoundEntries(top32);
    setRoundWinners([]);
    setMatchIndex(0);
    setHistory([]);
    setUndoStack([]);
    setPhase("bracket");
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
    link.download = `maimai-cup-${champion?.title ?? "result"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function resetAll() {
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
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">MAIMAI CUP</p>
          <h1>舞萌本命之巅</h1>
          <div className="cup-context">
            <span>{modeLabel}</span>
            <span>{usingImportedSongs ? "JP 曲库" : "Mock 曲库"}</span>
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
              {filters.mode === "song"
                ? "歌曲杯：以「一首歌」为参赛单位，不区分谱面难度。"
                : "谱面杯：以「歌 + 单一难度谱面」参赛，整届固定同难度对决。"}
            </p>

            <FilterBlock title="分类">
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

            <FilterBlock title="版本">
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
                <FilterBlock title="难度">
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
              <summary>高级 · 随机种子</summary>
              <label className="seed-field">
                默认已随机；填入相同种子可复现同一届抽签
                <div className="seed-row">
                  <input
                    value={filters.seed}
                    onChange={(event) => setFilters({ ...filters, seed: event.target.value })}
                    placeholder="例如 maimai-cup"
                  />
                  <button type="button" className="ghost-action" onClick={() => setFilters({ ...filters, seed: randomSeed() })}>
                    <Dices size={16} />
                    随机
                  </button>
                </div>
              </label>
            </details>

            <button className="primary-action" onClick={() => startDraw()} disabled={!canStart}>
              <Dices size={20} />
              开始抽签 48 强
            </button>
            {drawError ? <p className="form-error" role="alert">{drawError}</p> : null}
          </div>

          <div className="preview-grid">
            {pool.slice(0, 6).map((entry, index) => (
              <div className="stagger-item" style={{ ["--stagger" as string]: `${index * 55}ms` }} key={entry.id}>
                <SongCard entry={entry} mode="compact" />
              </div>
            ))}
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
                    <img src={entry.jacket} alt="" />
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
            <p>{revivalSelection.length === 8 ? "32 强阵容已就绪" : `还可选择 ${8 - revivalSelection.length} 个谱面或歌曲`}</p>
          </div>
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
            <button className="primary-action narrow" disabled={revivalSelection.length !== 8} onClick={startBracket}>
              <Swords size={18} />
              进入 32 强淘汰赛 · {revivalSelection.length}/8
            </button>
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
          <div className="duel-zone">
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
          <SharePoster
            captureRef={resultRef}
            champion={champion}
            runnerUp={finalRecord?.loser}
            topFour={topFour}
            championPath={championPath}
            history={history}
            modeLabel={modeLabel}
            seed={filters.seed}
          />
          <div className="result-actions">
            <button className="primary-inline" onClick={downloadShareImage}>
              <Camera size={17} />
              生成分享截图
            </button>
            <button className="ghost-action" onClick={resetAll}>
              <RefreshCw size={17} />
              重新开始
            </button>
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
    const duration = intro.variant === "champion" ? 6400 : 5200;
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
  seed
}: {
  captureRef: RefObject<HTMLDivElement>;
  champion: CupEntry;
  runnerUp?: CupEntry;
  topFour: CupEntry[];
  championPath: MatchRecord[];
  history: MatchRecord[];
  modeLabel: string;
  seed: string;
}) {
  return (
    <div className="share-poster" ref={captureRef}>
      <div className="poster-header">
        <div className="poster-kicker"><span>OFFICIAL RESULT</span><b>48 → 1</b></div>
        <p>MAIMAI CUP</p>
        <h2>{modeLabel} · 舞萌本命之巅</h2>
        <div className="poster-meta-line">
          <span className="poster-seed">SEED · {seed || "maimai-cup"}</span>
          <span>32 强完整晋级表</span>
        </div>
      </div>

      <div className="poster-layout">
        <BracketSide side="left" history={history} champion={champion} />

        <div className="poster-champion">
          <div className="champion-art">
            <img src={champion.jacket} alt={`${champion.title} jacket`} />
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
              <img src={runnerUp.jacket} alt="" />
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
              <img src={entry.jacket} alt="" />
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
      <img src={entry.jacket} alt="" />
      <span>{entry.title}</span>
    </div>
  );
}

function FilterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="filter-block">
      <div className="filter-title">{title}</div>
      <div className="chip-row">{children}</div>
    </div>
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

function randomSeed() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
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
