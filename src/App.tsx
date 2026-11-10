import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  History,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AnimeCardItem,
  AnimeDetail,
  GenreItem,
  WatchHistoryItem,
} from './types/anime';
import { AnimeCard } from './components/AnimeCard';
import { WatchTheater } from './components/WatchTheater';
import { LiveChatDrawer } from './components/LiveChatDrawer';
import heroBackdrop from './assets/images/anime_cinema_backdrop_1794254266932.jpg';

type ViewTab = 'discover' | 'latest' | 'catalog' | 'az' | 'watchlist' | 'search' | 'watch';

const AZ_LETTERS = [
  '#',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('discover');
  const [previousTab, setPreviousTab] = useState<ViewTab>('discover');

  // Home feed state
  const [featured, setFeatured] = useState<AnimeCardItem[]>([]);
  const [latest, setLatest] = useState<AnimeCardItem[]>([]);
  const [popular, setPopular] = useState<AnimeCardItem[]>([]);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState('');

  // Unlimited Catalog state
  const [catalogItems, setCatalogItems] = useState<AnimeCardItem[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogHasNext, setCatalogHasNext] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedGenreName, setSelectedGenreName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('popular');

  // A-Z Directory state
  const [azLetter, setAzLetter] = useState('A');
  const [azItems, setAzItems] = useState<AnimeCardItem[]>([]);
  const [azPage, setAzPage] = useState(1);
  const [azHasNext, setAzHasNext] = useState(false);
  const [azLoading, setAzLoading] = useState(false);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [liveResults, setLiveResults] = useState<AnimeCardItem[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchItems, setSearchItems] = useState<AnimeCardItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasNext, setSearchHasNext] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Active Watch Theater state
  const [watchAnimeSlug, setWatchAnimeSlug] = useState('');
  const [watchInitialEpSlug, setWatchInitialEpSlug] = useState<string | undefined>(undefined);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAnimeSlug, setChatAnimeSlug] = useState<string | undefined>(undefined);
  const [chatAnimeTitle, setChatAnimeTitle] = useState<string | undefined>(undefined);

  // Persistent Watchlist & Watch History
  const [watchlist, setWatchlist] = useState<AnimeCardItem[]>(() => {
    try {
      const saved = localStorage.getItem('gogostream_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<WatchHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('gogostream_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('gogostream_watched_eps');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const bookmarkedSlugs = useMemo(
    () => new Set(watchlist.map((item) => item.slug)),
    [watchlist]
  );

  // Fetch Home feed
  const loadHome = useCallback(() => {
    setHomeLoading(true);
    setHomeError('');
    fetch('/api/anime/home')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to connect to Gogoanime API');
        return data;
      })
      .then((data) => {
        setFeatured(data.featured || []);
        setLatest(data.latest || []);
        setPopular(data.popular || []);
        setGenres(data.genres || []);
      })
      .catch((err) => {
        setHomeError(err instanceof Error ? err.message : 'Unable to reach anime source');
      })
      .finally(() => setHomeLoading(false));
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // Fetch Catalog
  const fetchCatalog = useCallback(
    async (page: number, append: boolean) => {
      setCatalogLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (selectedGenre) params.set('genre', selectedGenre);
        if (selectedStatus) params.set('status', selectedStatus);
        if (selectedType) params.set('type', selectedType);
        if (selectedOrder) params.set('order', selectedOrder);

        const res = await fetch(`/api/anime/catalog?${params.toString()}`);
        const data = await res.json();
        const items: AnimeCardItem[] = data.items || [];
        setCatalogItems((prev) => {
          if (!append) return items;
          const seen = new Set(prev.map((i) => i.slug));
          return [...prev, ...items.filter((i) => !seen.has(i.slug))];
        });
        setCatalogPage(page);
        setCatalogHasNext(Boolean(data.hasNext));
      } finally {
        setCatalogLoading(false);
      }
    },
    [selectedGenre, selectedStatus, selectedType, selectedOrder]
  );

  useEffect(() => {
    if (activeTab === 'catalog') {
      fetchCatalog(1, false);
    }
  }, [activeTab, fetchCatalog]);

  // Fetch A-Z Directory
  const fetchAz = useCallback(async (letter: string, page: number, append: boolean) => {
    setAzLoading(true);
    try {
      const res = await fetch(
        `/api/anime/az?letter=${encodeURIComponent(letter)}&page=${page}`
      );
      const data = await res.json();
      const items: AnimeCardItem[] = data.items || [];
      setAzItems((prev) => {
        if (!append) return items;
        const seen = new Set(prev.map((i) => i.slug));
        return [...prev, ...items.filter((i) => !seen.has(i.slug))];
      });
      setAzPage(page);
      setAzHasNext(Boolean(data.hasNext));
    } finally {
      setAzLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'az') {
      fetchAz(azLetter, 1, false);
    }
  }, [activeTab, azLetter, fetchAz]);

  // Fetch Search
  const fetchSearch = useCallback(async (query: string, page: number, append: boolean) => {
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/anime/search?q=${encodeURIComponent(query)}&page=${page}`
      );
      const data = await res.json();
      const items: AnimeCardItem[] = data.items || [];
      setSearchItems((prev) => {
        if (!append) return items;
        const seen = new Set(prev.map((i) => i.slug));
        return [...prev, ...items.filter((i) => !seen.has(i.slug))];
      });
      setSearchPage(page);
      setSearchHasNext(Boolean(data.hasNext));
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Live instant search dropdown as user types
  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setLiveSearching(false);
      return;
    }

    let cancelled = false;
    setLiveSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=1`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) {
            setLiveResults((data.items || []).slice(0, 6));
          }
        })
        .catch(() => {
          if (!cancelled) setLiveResults([]);
        })
        .finally(() => {
          if (!cancelled) setLiveSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchInput]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setShowDropdown(false);
    setActiveSearchQuery(q);
    setActiveTab('search');
    fetchSearch(q, 1, false);
  };

  const handleToggleBookmark = (item: AnimeCardItem) => {
    setWatchlist((prev) => {
      const exists = prev.some((i) => i.slug === item.slug);
      const next = exists ? prev.filter((i) => i.slug !== item.slug) : [item, ...prev];
      localStorage.setItem('gogostream_watchlist', JSON.stringify(next));
      return next;
    });
  };

  const handleRecordWatch = useCallback(
    (detail: AnimeDetail, episodeSlug: string, episodeNumber: string) => {
      setWatchedEpisodes((prev) => {
        const next = new Set(prev);
        next.add(episodeSlug);
        localStorage.setItem('gogostream_watched_eps', JSON.stringify([...next]));
        return next;
      });

      setHistory((prev) => {
        const entry: WatchHistoryItem = {
          animeSlug: detail.slug,
          episodeSlug,
          title: detail.title,
          episodeNumber,
          image: detail.image,
          watchedAt: Date.now(),
        };
        const filtered = prev.filter((h) => h.animeSlug !== detail.slug);
        const next = [entry, ...filtered].slice(0, 24);
        localStorage.setItem('gogostream_history', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const handleSelectAnime = (item: AnimeCardItem) => {
    if (activeTab !== 'watch') {
      setPreviousTab(activeTab);
    }
    if (item.isEpisodeLink) {
      const derivedAnimeSlug = item.slug.replace(/-episode-\d+.*$/i, '');
      setWatchAnimeSlug(derivedAnimeSlug || item.slug);
      setWatchInitialEpSlug(item.slug);
    } else {
      setWatchAnimeSlug(item.slug);
      setWatchInitialEpSlug(undefined);
    }
    setActiveTab('watch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectGenre = (genreSlug: string, genreName: string) => {
    setSelectedGenre(genreSlug);
    setSelectedGenreName(genreName);
    setSelectedStatus('');
    setSelectedType('');
    setActiveTab('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const heroAnime = featured[0] || popular[0] || latest[0];

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F1F5F9] flex flex-col">
      {/* Top Navigation Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0D12]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus:outline-none"
          >
            Gogo<span className="text-rose-500">Stream</span>
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['discover', 'Discover'],
                ['latest', 'Latest'],
                ['catalog', 'Catalog'],
                ['az', 'A–Z Index'],
                ['watchlist', 'Watchlist'],
              ] as [ViewTab, string][]
            ).map(([tab, label]) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-rose-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setChatAnimeSlug(activeTab === 'watch' ? watchAnimeSlug : undefined);
                setChatAnimeTitle(undefined);
                setChatOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap shrink-0"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Live Chat</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Strip */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-white/5 px-4 py-2 text-xs font-medium">
          {(
            [
              ['discover', 'Discover'],
              ['latest', 'Latest'],
              ['catalog', 'Catalog'],
              ['az', 'A–Z'],
              ['watchlist', 'Watchlist'],
            ] as [ViewTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === tab ? 'text-rose-400 font-semibold' : 'text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Search Toolbar — Always Accessible with Live Instant Results */}
      <div className="border-b border-white/5 bg-[#0E1118] relative z-30">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="relative flex-1 max-w-xl">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchInput}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowDropdown(true);
                }}
                placeholder="Search unlimited anime (e.g. One Piece, Solo Leveling, Naruto)..."
                className="w-full rounded-lg border border-white/10 bg-[#141824] py-2 pl-10 pr-24 text-sm text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setLiveResults([]);
                  }}
                  aria-label="Clear search"
                  className="absolute right-16 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500"
              >
                Search
              </button>
            </form>

            {/* Live Instant Search Dropdown */}
            {showDropdown && searchInput.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#121620] shadow-2xl">
                {liveSearching ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-500" />
                    <span>Searching "{searchInput.trim()}"...</span>
                  </div>
                ) : liveResults.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400">
                    No instant matches. Press Enter to run full search.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {liveResults.map((item) => (
                      <button
                        key={item.slug}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setShowDropdown(false);
                          handleSelectAnime(item);
                        }}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5"
                      >
                        <img
                          src={item.image}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="h-12 w-9 shrink-0 rounded object-cover bg-[#181D2A]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">
                            {item.title}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {item.type} · {item.subOrDub} · {item.statusOrEp}
                          </div>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSearchSubmit(e);
                      }}
                      className="block w-full bg-[#181D2A] px-4 py-2 text-center text-xs font-medium text-rose-400 hover:bg-[#1E2536]"
                    >
                      View all results for "{searchInput.trim()}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Quick Browse:</span>
            <button
              type="button"
              onClick={() => handleSelectGenre('action', 'Action')}
              className="rounded-md border border-white/10 bg-[#141824] px-2.5 py-1 text-slate-300 hover:border-rose-500/50 hover:text-white"
            >
              Action
            </button>
            <button
              type="button"
              onClick={() => handleSelectGenre('isekai', 'Isekai')}
              className="rounded-md border border-white/10 bg-[#141824] px-2.5 py-1 text-slate-300 hover:border-rose-500/50 hover:text-white"
            >
              Isekai
            </button>
            <button
              type="button"
              onClick={() => handleSelectGenre('fantasy', 'Fantasy')}
              className="rounded-md border border-white/10 bg-[#141824] px-2.5 py-1 text-slate-300 hover:border-rose-500/50 hover:text-white"
            >
              Fantasy
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1">
        {activeTab === 'watch' && watchAnimeSlug && (
          <WatchTheater
            animeSlug={watchAnimeSlug}
            initialEpisodeSlug={watchInitialEpSlug}
            bookmarkedSlugs={bookmarkedSlugs}
            watchedEpisodes={watchedEpisodes}
            onBack={() => setActiveTab(previousTab === 'watch' ? 'discover' : previousTab)}
            onSelectAnime={handleSelectAnime}
            onSelectGenre={handleSelectGenre}
            onToggleBookmark={handleToggleBookmark}
            onRecordWatch={handleRecordWatch}
            onOpenChat={(slug, title) => {
              setChatAnimeSlug(slug);
              setChatAnimeTitle(title);
              setChatOpen(true);
            }}
          />
        )}

        {/* DISCOVER VIEW */}
        {activeTab === 'discover' && (
          <div>
            {/* Hero Banner */}
            <section className="relative overflow-hidden border-b border-white/10">
              <div className="absolute inset-0">
                <img
                  src={heroBackdrop}
                  alt="Tokyo twilight anime skyline"
                  className="h-full w-full object-cover opacity-45"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D12] via-[#0B0D12]/85 to-[#0B0D12]/40" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-transparent to-transparent" />
              </div>

              <div className="relative mx-auto max-w-[1360px] px-4 py-12 sm:px-6 lg:py-16">
                {heroAnime ? (
                  <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                      <p className="text-xs font-medium text-rose-400">
                        Featured Stream · Multi-Server HD
                      </p>
                      <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-5xl text-balance">
                        {heroAnime.title}
                      </h1>
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                        <span>{heroAnime.type || 'TV Series'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{heroAnime.subOrDub || 'Sub & Dub'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{heroAnime.statusOrEp || 'HD Streaming'}</span>
                      </div>
                      <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
                        Stream unlimited episodes directly with multi-mirror HD servers, instant
                        server switching, and live episode discussion rooms.
                      </p>

                      <div className="mt-7 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectAnime(heroAnime)}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          <span>Watch Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBookmark(heroAnime)}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 whitespace-nowrap"
                        >
                          <Bookmark
                            className={`h-4 w-4 ${
                              bookmarkedSlugs.has(heroAnime.slug) ? 'fill-current text-rose-400' : ''
                            }`}
                          />
                          <span>
                            {bookmarkedSlugs.has(heroAnime.slug) ? 'In Watchlist' : 'Add to Watchlist'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="hidden lg:flex lg:col-span-4 justify-end">
                      <button
                        type="button"
                        onClick={() => handleSelectAnime(heroAnime)}
                        className="group relative w-56 aspect-[3/4] overflow-hidden rounded-xl border border-white/15 bg-[#121620] shadow-2xl"
                      >
                        <img
                          src={heroAnime.image}
                          alt={heroAnime.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </button>
                    </div>
                  </div>
                ) : homeLoading ? (
                  <div className="h-64 animate-pulse rounded-xl bg-white/5" />
                ) : (
                  <div className="py-12">
                    <h1 className="text-3xl font-bold text-white sm:text-4xl">
                      Unlimited Anime Streaming
                    </h1>
                    <p className="mt-2 text-sm text-slate-400">
                      Connected to Gogoanime catalog with multi-server HD playback.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <div className="mx-auto max-w-[1360px] space-y-12 px-4 py-10 sm:px-6">
              {homeError && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  <span>{homeError}</span>
                  <button
                    type="button"
                    onClick={loadHome}
                    className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              )}

              {/* Continue Watching */}
              {history.length > 0 && (
                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-rose-500" />
                      <h2 className="text-lg font-semibold text-white">Continue Watching</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('watchlist')}
                      className="text-xs font-medium text-slate-400 hover:text-white"
                    >
                      Manage History
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {history.slice(0, 4).map((h) => (
                      <button
                        key={h.animeSlug}
                        type="button"
                        onClick={() => {
                          setPreviousTab('discover');
                          setWatchAnimeSlug(h.animeSlug);
                          setWatchInitialEpSlug(h.episodeSlug);
                          setActiveTab('watch');
                        }}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121620] p-2.5 text-left transition-colors hover:border-rose-500/40 hover:bg-[#171C29]"
                      >
                        <img
                          src={h.image}
                          alt={h.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-12 shrink-0 rounded-md object-cover bg-[#181D2A]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{h.title}</div>
                          <div className="mt-1 font-mono text-xs text-rose-400 tabular-nums">
                            Episode {h.episodeNumber}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Latest Releases */}
              <section>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-rose-500" />
                    <h2 className="text-xl font-semibold text-white">Latest Releases</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('latest')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-rose-400"
                  >
                    <span>View All</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {homeLoading ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-[#141824]" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {latest.slice(0, 12).map((item) => (
                      <AnimeCard
                        key={item.slug}
                        item={item}
                        isBookmarked={bookmarkedSlugs.has(item.slug)}
                        onSelect={handleSelectAnime}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Popular Series */}
              <section>
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-rose-500" />
                    <h2 className="text-xl font-semibold text-white">Popular Series</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGenre('');
                      setSelectedGenreName('');
                      setActiveTab('catalog');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-rose-400"
                  >
                    <span>Browse Unlimited Catalog</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {popular.slice(0, 12).map((item) => (
                    <AnimeCard
                      key={item.slug}
                      item={item}
                      isBookmarked={bookmarkedSlugs.has(item.slug)}
                      onSelect={handleSelectAnime}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </div>
              </section>

              {/* Genres Directory */}
              {genres.length > 0 && (
                <section className="border-t border-white/10 pt-8">
                  <div className="mb-4 flex items-center gap-2">
                    <Compass className="h-4 w-4 text-rose-500" />
                    <h2 className="text-lg font-semibold text-white">Browse by Genre</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {genres.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        onClick={() => handleSelectGenre(g.slug, g.name)}
                        className="rounded-lg border border-white/10 bg-[#121620] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/50 hover:bg-[#181D2A] hover:text-white"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* LATEST RELEASES VIEW */}
        {activeTab === 'latest' && (
          <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Latest Releases</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Freshly updated episodes and series from Gogoanime.
                </p>
              </div>
              <button
                type="button"
                onClick={loadHome}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121620] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-[#181D2A]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${homeLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {latest.map((item) => (
                <AnimeCard
                  key={item.slug}
                  item={item}
                  isBookmarked={bookmarkedSlugs.has(item.slug)}
                  onSelect={handleSelectAnime}
                  onToggleBookmark={handleToggleBookmark}
                />
              ))}
            </div>
          </div>
        )}

        {/* UNLIMITED CATALOG VIEW */}
        {activeTab === 'catalog' && (
          <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {selectedGenreName ? `${selectedGenreName} Anime` : 'Unlimited Anime Catalog'}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Browse the complete library with multi-page loading and live filters.
                </p>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Filter by genre"
                  value={selectedGenre}
                  onChange={(e) => {
                    const slug = e.target.value;
                    const found = genres.find((g) => g.slug === slug);
                    setSelectedGenre(slug);
                    setSelectedGenreName(found?.name || slug);
                  }}
                  className="rounded-lg border border-white/10 bg-[#121620] px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                >
                  <option value="">All Genres</option>
                  {genres.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by status"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedGenre('');
                    setSelectedGenreName('');
                    setSelectedStatus(e.target.value);
                  }}
                  className="rounded-lg border border-white/10 bg-[#121620] px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                >
                  <option value="">All Status</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>

                <select
                  aria-label="Filter by type"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedGenre('');
                    setSelectedGenreName('');
                    setSelectedType(e.target.value);
                  }}
                  className="rounded-lg border border-white/10 bg-[#121620] px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                >
                  <option value="">All Types</option>
                  <option value="TV">TV Series</option>
                  <option value="Movie">Movie</option>
                  <option value="OVA">OVA</option>
                  <option value="ONA">ONA</option>
                </select>

                <select
                  aria-label="Sort order"
                  value={selectedOrder}
                  onChange={(e) => setSelectedOrder(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#121620] px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                >
                  <option value="popular">Most Popular</option>
                  <option value="update">Latest Updated</option>
                  <option value="title">A–Z Title</option>
                </select>
              </div>
            </div>

            {catalogItems.length === 0 && catalogLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-[#141824]" />
                ))}
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#121620] py-16 text-center">
                <p className="text-sm text-slate-400">No anime found for these filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGenre('');
                    setSelectedGenreName('');
                    setSelectedStatus('');
                    setSelectedType('');
                  }}
                  className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {catalogItems.map((item) => (
                    <AnimeCard
                      key={item.slug}
                      item={item}
                      isBookmarked={bookmarkedSlugs.has(item.slug)}
                      onSelect={handleSelectAnime}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </div>

                {catalogHasNext && (
                  <div className="mt-10 flex justify-center">
                    <button
                      type="button"
                      disabled={catalogLoading}
                      onClick={() => fetchCatalog(catalogPage + 1, true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121620] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1B2030] disabled:opacity-50"
                    >
                      {catalogLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                      <span>
                        {catalogLoading
                          ? 'Loading more anime...'
                          : `Load More Anime (Page ${catalogPage + 1})`}
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* A-Z UNLIMITED DIRECTORY */}
        {activeTab === 'az' && (
          <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
            <h1 className="text-2xl font-bold text-white">A–Z Anime Directory</h1>
            <p className="mt-1 text-sm text-slate-400">
              Explore every title alphabetically across the entire archive.
            </p>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {AZ_LETTERS.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setAzLetter(letter)}
                  className={`h-9 min-w-[36px] rounded-lg border px-2.5 font-mono text-xs font-medium transition-colors ${
                    azLetter === letter
                      ? 'border-rose-500 bg-rose-600 text-white'
                      : 'border-white/10 bg-[#121620] text-slate-300 hover:bg-[#181D2A]'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>

            <div className="mt-8">
              {azItems.length === 0 && azLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-[#141824]" />
                  ))}
                </div>
              ) : azItems.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#121620] py-16 text-center text-sm text-slate-400">
                  No titles found under "{azLetter}".
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {azItems.map((item) => (
                      <AnimeCard
                        key={item.slug}
                        item={item}
                        isBookmarked={bookmarkedSlugs.has(item.slug)}
                        onSelect={handleSelectAnime}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </div>
                  {azHasNext && (
                    <div className="mt-10 flex justify-center">
                      <button
                        type="button"
                        disabled={azLoading}
                        onClick={() => fetchAz(azLetter, azPage + 1, true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121620] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#1B2030] disabled:opacity-50"
                      >
                        {azLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        <span>Load More "{azLetter}" Titles</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* SEARCH RESULTS */}
        {activeTab === 'search' && (
          <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6">
            <h1 className="text-2xl font-bold text-white">
              Search Results for "{activeSearchQuery}"
            </h1>

            <div className="mt-6">
              {searchItems.length === 0 && searchLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-[#141824]" />
                  ))}
                </div>
              ) : searchItems.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#121620] py-16 text-center">
                  <p className="text-sm text-slate-400">
                    No anime matched "{activeSearchQuery}". Try another keyword.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {searchItems.map((item) => (
                      <AnimeCard
                        key={item.slug}
                        item={item}
                        isBookmarked={bookmarkedSlugs.has(item.slug)}
                        onSelect={handleSelectAnime}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </div>
                  {searchHasNext && (
                    <div className="mt-10 flex justify-center">
                      <button
                        type="button"
                        disabled={searchLoading}
                        onClick={() => fetchSearch(activeSearchQuery, searchPage + 1, true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121620] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#1B2030] disabled:opacity-50"
                      >
                        {searchLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        <span>Load More Results</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* WATCHLIST & HISTORY */}
        {activeTab === 'watchlist' && (
          <div className="mx-auto max-w-[1360px] space-y-10 px-4 py-8 sm:px-6">
            <section>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">Your Watchlist</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Saved series stored locally in your browser.
                  </p>
                </div>
                {watchlist.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWatchlist([]);
                      localStorage.removeItem('gogostream_watchlist');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121620] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear Watchlist</span>
                  </button>
                )}
              </div>

              {watchlist.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#121620] py-14 text-center">
                  <Bookmark className="mx-auto mb-2 h-7 w-7 text-slate-600" />
                  <p className="text-sm text-slate-400">Your watchlist is empty.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500"
                  >
                    Browse Unlimited Catalog
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {watchlist.map((item) => (
                    <AnimeCard
                      key={item.slug}
                      item={item}
                      isBookmarked={true}
                      onSelect={handleSelectAnime}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-white/10 pt-8">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Watch History</h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistory([]);
                      localStorage.removeItem('gogostream_history');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121620] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="text-sm text-slate-500">No episodes watched yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {history.map((h) => (
                    <button
                      key={h.animeSlug}
                      type="button"
                      onClick={() => {
                        setPreviousTab('watchlist');
                        setWatchAnimeSlug(h.animeSlug);
                        setWatchInitialEpSlug(h.episodeSlug);
                        setActiveTab('watch');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121620] p-3 text-left transition-colors hover:border-rose-500/40"
                    >
                      <img
                        src={h.image}
                        alt={h.title}
                        referrerPolicy="no-referrer"
                        className="h-16 w-12 shrink-0 rounded-md object-cover bg-[#181D2A]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{h.title}</div>
                        <div className="mt-1 font-mono text-xs text-rose-400 tabular-nums">
                          Episode {h.episodeNumber}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-white/10 bg-[#0B0D12] py-6">
        <div className="mx-auto flex max-w-[1360px] flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>GogoStream — Unlimited Anime Streaming</span>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => setActiveTab('catalog')} className="hover:text-slate-300">
              Unlimited Catalog
            </button>
            <button type="button" onClick={() => setActiveTab('az')} className="hover:text-slate-300">
              A–Z Index
            </button>
            <button type="button" onClick={() => setChatOpen(true)} className="hover:text-slate-300">
              Live Chat
            </button>
          </div>
        </div>
      </footer>

      {/* Live Community Chat Drawer */}
      <LiveChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        activeAnimeSlug={chatAnimeSlug}
        activeAnimeTitle={chatAnimeTitle}
      />
    </div>
  );
}
