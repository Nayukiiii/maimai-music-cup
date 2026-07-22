(() => {
  const SOURCE = location.hostname || "maimaidx.jp";
  const now = new Date().toISOString();
  const seen = new Set();

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const linesOf = (node) =>
    clean(node?.innerText ?? "")
      .split(/\s*(?:\n| {2,})\s*/)
      .map(clean)
      .filter(Boolean);
  const absoluteUrl = (url) => {
    try {
      return new URL(url, location.href).href;
    } catch {
      return "";
    }
  };
  const slugify = (value) =>
    clean(value)
      .toLowerCase()
      .replace(/&amp;/g, "and")
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

  const difficultyNames = ["basic", "advanced", "expert", "master", "remaster", "re:master", "utage"];
  const looksLikeMeta = (line) =>
    /^(basic|advanced|expert|master|remaster|re:master|utage|dx|standard|std)$/i.test(line) ||
    /^(lv\.?|level)\s*\d/i.test(line) ||
    /^bpm\s*\d/i.test(line) ||
    /^\d+(\.\d)?$/.test(line);

  const imageUrlsFrom = (img) =>
    [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-lazy"),
      img.getAttribute("srcset")?.split(",")[0]?.trim()?.split(/\s+/)[0]
    ]
      .map(absoluteUrl)
      .filter(Boolean);

  const isLikelyJacket = (img, url) => {
    const haystack = clean(
      [
        url,
        img.alt,
        img.className,
        img.id,
        img.parentElement?.className,
        img.parentElement?.id
      ].join(" ")
    ).toLowerCase();
    const bigEnough = (img.naturalWidth || img.width || 0) >= 80 && (img.naturalHeight || img.height || 0) >= 80;
    const squareish =
      !img.naturalWidth ||
      !img.naturalHeight ||
      Math.abs(img.naturalWidth - img.naturalHeight) / Math.max(img.naturalWidth, img.naturalHeight) < 0.28;

    return (
      bigEnough &&
      squareish &&
      /\.(png|jpe?g|webp)(\?|#|$)/i.test(url) &&
      !/(logo|icon|btn|button|arrow|rank|diff|level|tab|banner|bg|background)/i.test(haystack)
    );
  };

  const findCard = (img) => {
    let node = img;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = clean(node.innerText);
      const imageCount = node.querySelectorAll?.("img")?.length ?? 0;
      if (text.length >= 2 && text.length <= 900 && imageCount >= 1) {
        return node;
      }
      node = node.parentElement;
    }
    return img.parentElement ?? img;
  };

  const pickTitle = (img, cardLines) => {
    const alt = clean(img.alt).replace(/\.(png|jpe?g|webp)$/i, "");
    if (alt && !looksLikeMeta(alt) && !/jacket|image|song/i.test(alt)) {
      return alt;
    }

    const explicit =
      img
        .closest("[class*='music'], [class*='song'], [class*='track']")
        ?.querySelector("[class*='title'], [class*='name'], h1, h2, h3, h4")?.textContent ?? "";
    const explicitTitle = clean(explicit);
    if (explicitTitle && !looksLikeMeta(explicitTitle)) {
      return explicitTitle;
    }

    return cardLines.find((line) => line.length > 1 && !looksLikeMeta(line)) ?? "";
  };

  const parseCharts = (cardLines) => {
    const joined = cardLines.join(" / ");
    const charts = [];
    for (const difficulty of difficultyNames) {
      const difficultyLabel = difficulty === "remaster" ? "Re:Master" : difficulty.replace(/^./, (c) => c.toUpperCase());
      const matcher = new RegExp(`${difficulty.replace(":", "\\s*:?\\s*")}[^0-9]*(\\d{1,2}\\+?)(?:[^0-9]+(\\d{1,2}\\.\\d))?`, "i");
      const match = joined.match(matcher);
      if (match) {
        charts.push({
          difficulty: difficultyLabel,
          level: match[1],
          inferredConstant: match[2] ? Number(match[2]) : undefined
        });
      }
    }
    return charts;
  };

  const parseOne = (img, jacketUrl) => {
    const card = findCard(img);
    const cardLines = linesOf(card);
    const title = pickTitle(img, cardLines);
    const titleIndex = cardLines.findIndex((line) => line === title);
    const artist =
      cardLines
        .slice(Math.max(0, titleIndex + 1))
        .find((line) => line !== title && !looksLikeMeta(line) && !difficultyNames.includes(line.toLowerCase())) ?? "";
    const bpm = Number((cardLines.join(" ").match(/bpm\s*[:：]?\s*(\d{2,3})/i) ?? [])[1] ?? "") || undefined;
    const idFromUrl = jacketUrl.match(/(?:^|\/)(\d{3,6}|[a-z0-9_-]{4,})(?:\.(?:png|jpe?g|webp))/i)?.[1];
    const songId = idFromUrl || slugify(title || img.alt || jacketUrl);

    return {
      id: songId,
      title,
      artist,
      jacket: jacketUrl,
      bpm,
      charts: parseCharts(cardLines),
      source: SOURCE,
      page: location.href,
      dumpedAt: now,
      rawText: cardLines
    };
  };

  const songs = [];
  for (const img of document.querySelectorAll("img")) {
    for (const url of imageUrlsFrom(img)) {
      if (!isLikelyJacket(img, url) || seen.has(url)) {
        continue;
      }
      seen.add(url);
      const song = parseOne(img, url);
      if (song.title || song.id) {
        songs.push(song);
      }
    }
  }

  const assetSources = songs.map((song) => ({
    songId: song.id,
    jacketUrl: song.jacket,
    licenseNote: `Dumped from ${SOURCE} visible page ${location.href} at ${now}; verify permission before publishing.`
  }));

  const downloadJson = (filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  console.table(songs.map(({ id, title, artist, jacket }) => ({ id, title, artist, jacket })));
  downloadJson(`maimaidx-dump-${Date.now()}.json`, songs);
  downloadJson(`asset-sources-${Date.now()}.json`, assetSources);
  window.__MAIMAIDX_DUMP__ = { songs, assetSources };
  console.log(`Dumped ${songs.length} possible song jacket entries. Data is also available at window.__MAIMAIDX_DUMP__.`);
})();
