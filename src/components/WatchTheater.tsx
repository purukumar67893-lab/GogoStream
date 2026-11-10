import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  CheckCircle2,
  AlertCircle,
  Film,
} from 'lucide-react';
import type { AnimeCardItem, AnimeDetail, VideoServer, WatchData } from '../types/anime';
import { AnimeCard } from './AnimeCard';

interface WatchTheaterProps {
  animeSlug: string;
  initialEpisodeSlug?: string;
  bookmarkedSlugs: Set<string>;
  watchedEpisodes: Set<string>;
  onBack: () => void;
  onSelectAnime: (item: AnimeCardItem) => void;
  onSelectGenre: (genreSlug: string, genreName: string) => void;
  onToggleBookmark: (item: AnimeCardItem) => void;
  onRecordWatch: (detail: AnimeDetail, episodeSlug: string, episodeNumber: string) => void;
  onOpenChat: (slug: string, title: string) => void;
}

interface ServerStatus {
  ok: boolean;
  latencyMs: number;
}

export const WatchTheater: React.FC<WatchTheaterProps> = ({
  animeSlug,
  initialEpisodeSlug,
  bookmarkedSlugs,
  watchedEpisodes,
  onBack,
  onSelectAnime,
  onSelectGenre,
  onToggleBookmark,
  onRecordWatch,
  onOpenChat,
}) => {
  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState('');

  const [activeEpisodeSlug, setActiveEpisodeSlug] = useState<string>(initialEpisodeSlug || '');
  const [watchData, setWatchData] = useState<WatchData | null>(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState('');

  const [activeServer, setActiveServer] = useState<VideoServer | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});
  const [checkingServers, setCheckingServers] = useState(false);
  const [episodeFilter, setEpisodeFilter] = useState('');
  const [posterError, setPosterError] = useState(false);

  // Load anime detail
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    setPosterError(false);

    fetch(`/api/anime/detail/${encodeURIComponent(animeSlug)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load anime details');
        return data as AnimeDetail;
      })
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        if (initialEpisodeSlug) {
          setActiveEpisodeSlug(initialEpisodeSlug);
        } else if (data.episodes.length > 0) {
          setActiveEpisodeSlug(data.episodes[0].slug);
        } else {
          setActiveEpisodeSlug('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'Failed to load anime');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeSlug, initialEpisodeSlug]);

  // Load episode video servers whenever activeEpisodeSlug changes
  useEffect(() => {
    if (!activeEpisodeSlug) {
      setWatchData(null);
      setActiveServer(null);
      return;
    }

    let cancelled = false;
    setWatchLoading(true);
    setWatchError('');
    setServerStatuses({});

    fetch(`/api/anime/watch/${encodeURIComponent(activeEpisodeSlug)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load video servers');
        return data as WatchData;
      })
      .then((data) => {
        if (cancelled) return;
        setWatchData(data);
        if (data.servers.length > 0) {
          setActiveServer(data.servers[0]);
          setIframeLoading(true);
          setIframeKey((k) => k + 1);
        } else {
          setActiveServer(null);
        }
        if (detail) {
          const epObj = detail.episodes.find((e) => e.slug === activeEpisodeSlug);
          onRecordWatch(detail, activeEpisodeSlug, epObj?.number || '1');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWatchError(err instanceof Error ? err.message : 'Failed to load servers');
        }
      })
      .finally(() => {
        if (!cancelled) setWatchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEpisodeSlug, detail]);

  // Safety timeout so loading overlay never stays stuck over the player
  useEffect(() => {
    if (!iframeLoading) return;
    const t = setTimeout(() => setIframeLoading(false), 3500);
    return () => clearTimeout(t);
  }, [iframeLoading, iframeKey]);

  const currentEpisodeIndex = useMemo(() => {
    if (!detail || !activeEpisodeSlug) return -1;
    return detail.episodes.findIndex((ep) => ep.slug === activeEpisodeSlug);
  }, [detail, activeEpisodeSlug]);

  const prevEpSlug = useMemo(() => {
    if (watchData?.prevEpisode) return watchData.prevEpisode;
    if (detail && currentEpisodeIndex > 0) return detail.episodes[currentEpisodeIndex - 1].slug;
    return '';
  }, [watchData, detail, currentEpisodeIndex]);

  const nextEpSlug = useMemo(() => {
    if (watchData?.nextEpisode) return watchData.nextEpisode;
    if (detail && currentEpisodeIndex >= 0 && currentEpisodeIndex < detail.episodes.length - 1) {
      return detail.episodes[currentEpisodeIndex + 1].slug;
    }
    return '';
  }, [watchData, detail, currentEpisodeIndex]);

  const filteredEpisodes = useMemo(() => {
    if (!detail) return [];
    const q = episodeFilter.trim().toLowerCase();
    if (!q) return detail.episodes;
    return detail.episodes.filter(
      (ep) => ep.number.toLowerCase().includes(q) || ep.title.toLowerCase().includes(q)
    );
  }, [detail, episodeFilter]);

  const handleVerifyServers = async () => {
    if (!watchData || watchData.servers.length === 0 || checkingServers) return;
    setCheckingServers(true);
    try {
      const results = await Promise.all(
        watchData.servers.map(async (srv) => {
          try {
            const res = await fetch(`/api/anime/server-check?url=${encodeURIComponent(srv.url)}`);
            const data = await res.json();
            return [srv.url, { ok: Boolean(data.ok), latencyMs: Number(data.latencyMs) || 0 }] as const;
          } catch {
            return [srv.url, { ok: false, latencyMs: 0 }] as const;
          }
        })
      );
      setServerStatuses(Object.fromEntries(results));
    } finally {
      setCheckingServers(false);
    }
  };

  if (detailLoading) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
        <div className="mb-6 h-8 w-40 animate-pulse rounded bg-white/5" />
        <div className="aspect-video w-full animate-pulse rounded-xl bg-[#131722]" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-xl bg-[#131722] lg:col-span-2" />
          <div className="h-48 animate-pulse rounded-xl bg-[#131722]" />
        </div>
      </div>
    );
  }

  if (detailError || !detail) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-16 text-center sm:px-6">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
        <h2 className="text-xl font-semibold text-white">Unable to Load Anime</h2>
        <p className="mt-2 text-sm text-slate-400">{detailError || 'Anime not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Browse
        </button>
      </div>
    );
  }

  const isBookmarked = bookmarkedSlugs.has(detail.slug);
  const asCardItem: AnimeCardItem = {
    slug: detail.slug,
    title: detail.title,
    image: detail.image,
    type: detail.type,
    statusOrEp: `${detail.episodes.length} Episodes`,
    subOrDub: 'Sub / Dub',
    url: `https://gogoanime.or.at/anime/${detail.slug}/`,
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6">
      {/* Top Breadcrumb & Quick Actions */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Catalog</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleBookmark(asCardItem)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              isBookmarked
                ? 'border-rose-500/50 bg-rose-600/15 text-rose-400'
                : 'border-white/10 bg-[#131722] text-slate-200 hover:bg-[#1B2030]'
            }`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
            <span>{isBookmarked ? 'Saved in Watchlist' : 'Add to Watchlist'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenChat(detail.slug, detail.title)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Episode Chat</span>
          </button>
        </div>
      </div>

      {/* Main Theater Grid: Player + Episode Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 cols: Video Player + Server Switcher */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            {watchLoading ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="h-7 w-7 animate-spin text-rose-500" />
                <span className="text-sm">Connecting to streaming servers...</span>
              </div>
            ) : watchError ? (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="mb-2 h-8 w-8 text-rose-500" />
                <p className="text-sm font-medium text-white">{watchError}</p>
                <button
                  type="button"
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500"
                >
                  Retry Connection
                </button>
              </div>
            ) : activeServer ? (
              <>
                {iframeLoading && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 text-slate-300">
                    <RefreshCw className="h-6 w-6 animate-spin text-rose-500" />
                    <span className="text-xs">Loading {activeServer.name}...</span>
                  </div>
                )}
                <iframe
                  key={`${activeServer.url}-${iframeKey}`}
                  src={activeServer.url}
                  title={`${detail.title} - ${activeServer.name}`}
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  onLoad={() => setIframeLoading(false)}
                  className="h-full w-full border-0"
                />
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-slate-400">
                <Film className="mb-2 h-8 w-8 text-slate-600" />
                <p className="text-sm">
                  {detail.episodes.length === 0
                    ? 'No episodes released yet for this title.'
                    : 'Select an episode to begin streaming.'}
                </p>
              </div>
            )}
          </div>

          {/* Episode Navigation & Player Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#121620] px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-400">Now Playing</div>
              <div className="truncate text-sm font-semibold text-white">
                {watchData?.title || detail.title}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!prevEpSlug}
                onClick={() => prevEpSlug && setActiveEpisodeSlug(prevEpSlug)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#181D2A] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#22293B] disabled:opacity-40 whitespace-nowrap"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                disabled={!nextEpSlug}
                onClick={() => nextEpSlug && setActiveEpisodeSlug(nextEpSlug)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#181D2A] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#22293B] disabled:opacity-40 whitespace-nowrap"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIframeLoading(true);
                  setIframeKey((k) => k + 1);
                }}
                title="Reload player"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181D2A] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#22293B] whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reload</span>
              </button>

              {activeServer && (
                <a
                  href={activeServer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181D2A] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#22293B] whitespace-nowrap"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Tab</span>
                </a>
              )}
            </div>
          </div>

          {/* All Connected Video Servers */}
          <div className="rounded-xl border border-white/10 bg-[#121620] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-semibold text-white">
                  Streaming Servers ({watchData?.servers.length || 0})
                </h3>
              </div>

              <button
                type="button"
                onClick={handleVerifyServers}
                disabled={checkingServers || !watchData?.servers.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#181D2A] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#22293B] disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${checkingServers ? 'animate-spin' : ''}`} />
                <span>{checkingServers ? 'Checking...' : 'Check Server Status'}</span>
              </button>
            </div>

            {watchData && watchData.servers.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {watchData.servers.map((srv) => {
                    const isActive = activeServer?.url === srv.url;
                    const status = serverStatuses[srv.url];
                    return (
                      <button
                        key={`${srv.name}-${srv.index}`}
                        type="button"
                        onClick={() => {
                          setActiveServer(srv);
                          setIframeLoading(true);
                          setIframeKey((k) => k + 1);
                        }}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border-rose-500 bg-rose-600 text-white'
                            : 'border-white/10 bg-[#181D2A] text-slate-200 hover:bg-[#22293B]'
                        }`}
                      >
                        <span>{srv.name}</span>
                        <span className={isActive ? 'text-rose-100' : 'text-slate-400'}>
                          {srv.category}
                        </span>
                        {status && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
                            {status.ok ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <AlertCircle className="h-3 w-3 text-amber-400" />
                            )}
                            {status.latencyMs}ms
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {activeServer && (
                  <p className="mt-3 text-xs text-slate-400">
                    If a server shows a black screen in your browser, try switching to another mirror above or{' '}
                    <a
                      href={activeServer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-rose-400 underline hover:text-rose-300"
                    >
                      open {activeServer.name} directly in a new tab
                    </a>
                    .
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">
                No mirror servers detected for this episode yet.
              </p>
            )}
          </div>
        </div>

        {/* Right 4 cols: Episode List */}
        <div className="lg:col-span-4 flex flex-col rounded-xl border border-white/10 bg-[#121620] overflow-hidden max-h-[680px]">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Episodes ({detail.episodes.length})
              </h3>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {detail.status}
              </span>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={episodeFilter}
                onChange={(e) => setEpisodeFilter(e.target.value)}
                placeholder="Jump to episode number..."
                className="w-full rounded-lg border border-white/10 bg-[#0B0D12] py-2 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {filteredEpisodes.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No episodes match "{episodeFilter}".
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                {filteredEpisodes.map((ep) => {
                  const isCurrent = ep.slug === activeEpisodeSlug;
                  const isWatched = watchedEpisodes.has(ep.slug);
                  return (
                    <button
                      key={ep.slug}
                      type="button"
                      onClick={() => setActiveEpisodeSlug(ep.slug)}
                      title={ep.title}
                      className={`flex items-center justify-center rounded-lg border px-2.5 py-2 font-mono text-xs font-medium transition-colors tabular-nums ${
                        isCurrent
                          ? 'border-rose-500 bg-rose-600 text-white'
                          : isWatched
                            ? 'border-white/5 bg-[#181D2A]/60 text-slate-400 hover:bg-[#22293B] hover:text-white'
                            : 'border-white/10 bg-[#181D2A] text-slate-200 hover:bg-[#22293B]'
                      }`}
                    >
                      Ep {ep.number}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Anime Synopsis & Metadata Section */}
      <div className="mt-8 grid grid-cols-1 gap-8 border-t border-white/10 pt-8 md:grid-cols-12">
        <div className="md:col-span-3 lg:col-span-2">
          <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/10 bg-[#141824]">
            {!posterError && detail.image ? (
              <img
                src={detail.image}
                alt={detail.title}
                referrerPolicy="no-referrer"
                onError={() => setPosterError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-600">
                <Film className="h-8 w-8" />
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-9 lg:col-span-10">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {detail.title}
          </h1>
          {detail.altTitle && (
            <p className="mt-1 text-sm text-slate-400">{detail.altTitle}</p>
          )}

          {/* Unboxed Metadata Line */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            <span>{detail.type}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{detail.status}</span>
            {detail.released && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{detail.released}</span>
              </>
            )}
            {detail.studio && detail.studio !== 'Unknown' && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>{detail.studio}</span>
              </>
            )}
            {detail.rating && detail.rating !== 'N/A' && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums">Score {detail.rating}</span>
              </>
            )}
          </div>

          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-slate-300">
            {detail.synopsis}
          </p>

          {/* Clickable Genre Filter Buttons */}
          {detail.genres.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {detail.genres.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => onSelectGenre(g.slug, g.name)}
                  className="rounded-md border border-white/10 bg-[#141824] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/50 hover:text-white"
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Related Anime */}
      {detail.related.length > 0 && (
        <section className="mt-10 border-t border-white/10 pt-8">
          <h2 className="mb-5 text-lg font-semibold text-white">Related Series</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {detail.related.map((rel) => (
              <AnimeCard
                key={rel.slug}
                item={rel}
                isBookmarked={bookmarkedSlugs.has(rel.slug)}
                onSelect={onSelectAnime}
                onToggleBookmark={onToggleBookmark}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
