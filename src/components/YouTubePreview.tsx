import { Play, X, Youtube } from "lucide-react";
import { useState } from "react";
import { YouTubeSource, youtubeEmbedUrl } from "../data/youtube";

export function YouTubePreview({ source, title }: { source: YouTubeSource; title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="yt-preview" onClick={(event) => event.stopPropagation()}>
      {open ? (
        <span className="yt-frame">
          <iframe
            src={youtubeEmbedUrl(source)}
            title={`${title} - YouTube`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
          <button type="button" className="yt-close" onClick={() => setOpen(false)} aria-label="关闭试听">
            <X size={14} />
          </button>
        </span>
      ) : (
        <button type="button" className="yt-play" onClick={() => setOpen(true)}>
          <Youtube size={14} />
          试听
          <Play size={12} />
        </button>
      )}
    </span>
  );
}
