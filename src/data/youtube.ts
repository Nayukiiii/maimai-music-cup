import rawSources from "./youtubeSources.json";

export interface YouTubeSource {
  videoId: string;
  start?: number;
}

export const youtubeSources: Record<string, YouTubeSource> = rawSources as Record<string, YouTubeSource>;

export function getYouTubeSource(songId: string): YouTubeSource | undefined {
  return youtubeSources[songId];
}

export function parseYouTube(input: string): YouTubeSource | null {
  const value = input.trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return { videoId: value };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  let videoId = "";
  if (url.hostname === "youtu.be") {
    videoId = url.pathname.slice(1);
  } else if (url.searchParams.get("v")) {
    videoId = url.searchParams.get("v")!;
  } else if (url.pathname.startsWith("/embed/")) {
    videoId = url.pathname.split("/embed/")[1];
  } else if (url.pathname.startsWith("/shorts/")) {
    videoId = url.pathname.split("/shorts/")[1];
  }

  videoId = (videoId || "").split(/[/?&]/)[0];
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  const t = url.searchParams.get("t") || url.searchParams.get("start");
  const start = parseYouTubeTime(t);
  return Number.isFinite(start) && start > 0 ? { videoId, start } : { videoId };
}

function parseYouTubeTime(value: string | null): number {
  if (!value) return NaN;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.toLowerCase().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return NaN;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function youtubeEmbedUrl(src: YouTubeSource, autoplay = true): string {
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (autoplay) params.set("autoplay", "1");
  if (src.start) params.set("start", String(src.start));
  return `https://www.youtube-nocookie.com/embed/${src.videoId}?${params.toString()}`;
}
