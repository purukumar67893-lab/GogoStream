import React, { useState } from 'react';
import { Bookmark, Play, Film } from 'lucide-react';
import type { AnimeCardItem } from '../types/anime';

interface AnimeCardProps {
  item: AnimeCardItem;
  isBookmarked: boolean;
  onSelect: (item: AnimeCardItem) => void;
  onToggleBookmark: (item: AnimeCardItem) => void;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  item,
  isBookmarked,
  onSelect,
  onToggleBookmark,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group flex flex-col">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-[#141824] border border-white/5">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="block h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          aria-label={`Watch ${item.title}`}
        >
          {!imgError && item.image ? (
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#161B28] to-[#0E121B] p-4 text-center">
              <Film className="mb-2 h-8 w-8 text-slate-600" />
              <span className="line-clamp-3 text-xs font-medium text-slate-400">
                {item.title}
              </span>
            </div>
          )}

          {/* Measured contrast scrim + play affordance */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-90" />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </div>

          <div className="absolute bottom-2.5 left-2.5 right-10 text-xs font-medium text-slate-200 truncate">
            {item.statusOrEp}
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(item);
          }}
          aria-label={isBookmarked ? `Remove ${item.title} from watchlist` : `Save ${item.title} to watchlist`}
          className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
            isBookmarked
              ? 'border-rose-500/60 bg-rose-600 text-white'
              : 'border-white/15 bg-black/60 text-slate-300 hover:bg-black/80 hover:text-white'
          }`}
        >
          <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSelect(item)}
        className="mt-2.5 text-left focus:outline-none"
      >
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-100 transition-colors group-hover:text-rose-400">
          {item.title}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <span>{item.type || 'TV'}</span>
          <span aria-hidden="true">·</span>
          <span>{item.subOrDub || 'Sub'}</span>
        </div>
      </button>
    </div>
  );
};
