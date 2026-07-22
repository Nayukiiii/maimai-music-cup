import html2canvas from "html2canvas";
import {
  ArrowLeft,
  Camera,
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
  minLevel: "1",
  maxLevel: "15",
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
  const resultRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => unique(songs.map((song) => song.category)), []);
  const versions = useMemo(() => unique(songs.map((song) => song.version)), []);
  const levelOptions = useMemo(
    () => unique(songs.flatMap((song) => song.charts.map((chart) => chart.level))).sort(compareLevel),
    []
  );
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
  const uniquePoolSongs = useMemo(() => new Set(pool.map((entry) => entry.songId)).size, [pool]);
  const canStart = uniquePoolSongs >= 48;
  const modeLabel = cupModeLabel(filters.mode);
  const difficultyModeText =
    filters.mode === "chart" ? `${filters.difficulties[0] ?? "Expert"} / Lv ${filters.minLevel}-${filters.maxLevel}` : "分类与版本";
  const cupMeta = `${modeLabel} / ${usingImportedSongs ? "CN 曲库" : "Mock 曲库"} / Seed ${filters.seed || "maimai-cup"}`;
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

    if (entries.length < 48) {
      return;
    }

    setFilters(seededFilters);
    setGroups(makeGroups(entries, seed));
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
    const canvas = await html2canvas(resultRef.current, {
      backgroundColor: "#130810",
      scale: Math.min(window.devicePixelRatio || 2, 3),
      useCORS: true,
      logging: false
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
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">MAIMAI CUP</p>
          <h1>舞萌本命之巅</h1>
          <div className="cup-context">
            <span>{modeLabel}</span>
            <span>{usingImportedSongs ? "CN 曲库" : "Mock 曲库"}</span>
            <span>{difficultyModeText}</span>
          </div>
        </div>
        <div className="phase-badge">
          <Trophy size={17} />
          {phaseLabel(phase)}
        </div>
      </div>

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
            <p className={`pool-status ${canStart ? "ok" : "bad"}`}>
              当前可参赛项 {pool.length} 个，去重歌曲 {uniquePoolSongs} 首，需要至少 48 首 / {usingImportedSongs ? "CN 曲库" : "Mock 曲库"}
            </p>
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
            subtitle="48 个参赛项分为 12 组，每组 4 个；同一首歌不会重复进入本届杯赛。"
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
                    {entry.chart ? <b>{entry.chart.difficulty}</b> : null}
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
          <button className="primary-action narrow" disabled={groupSelection.length !== 2} onClick={confirmGroup}>
            锁定直通名额
          </button>
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
          <button className="primary-action narrow" disabled={revivalSelection.length !== 8} onClick={startBracket}>
            进入 32 强淘汰赛
          </button>
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
  if (!intro) return null;

  return (
    <div className={`stage-intro intro-${intro.variant}`} key={intro.key} aria-hidden="true">
      <div className="stage-intro-inner">
        <span className="stage-intro-en">{intro.en}</span>
        <strong className="stage-intro-title">{intro.title}</strong>
        <span className="stage-intro-desc">{intro.desc}</span>
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
        <p>MAIMAI CUP</p>
        <h2>{modeLabel} · 舞萌本命之巅</h2>
        <span className="poster-seed">SEED · {seed || "maimai-cup"}</span>
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
              {champion.chart.difficulty} / Lv {champion.chart.level}
              {champion.chart.type && champion.chart.type !== "dx" ? ` / ${champion.chart.type.toUpperCase()}` : ""}
            </div>
          ) : null}
          {runnerUp ? <div className="runner-up">亚军 / {runnerUp.title}</div> : null}
        </div>

        <BracketSide side="right" history={history} champion={champion} />
      </div>

      <div className="poster-footer">
        <div className="poster-topfour">
          <span>四强</span>
          {topFour.slice(0, 4).map((entry) => (
            <b key={entry.id}>{entry.title}</b>
          ))}
        </div>
        <div className="poster-path">
          <span>冠军路径</span>
          {championPath.map((record) => (
            <b key={`${record.round}-${record.matchNumber}`}>{record.loser.title}</b>
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketSide({ side, history, champion }: { side: "left" | "right"; history: MatchRecord[]; champion: CupEntry }) {
  const rounds = side === "left" ? ["32 强", "16 强", "8 强", "半决赛"] : ["半决赛", "8 强", "16 强", "32 强"];
  return (
    <div className={`poster-bracket poster-bracket-${side}`}>
      {rounds.map((round) => {
        const matches = history.filter((record) => record.round === round);
        const midpoint = Math.ceil(matches.length / 2);
        const visible = side === "left" ? matches.slice(0, midpoint) : matches.slice(midpoint);
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
