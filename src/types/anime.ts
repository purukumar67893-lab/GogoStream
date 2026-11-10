export interface AnimeCardItem {
  slug: string;
  title: string;
  image: string;
  type: string;
  statusOrEp: string;
  subOrDub: string;
  url: string;
  isEpisodeLink?: boolean;
}

export interface GenreItem {
  name: string;
  slug: string;
}

export interface EpisodeItem {
  number: string;
  title: string;
  slug: string;
  date: string;
}

export interface AnimeDetail {
  slug: string;
  title: string;
  altTitle?: string;
  image: string;
  synopsis: string;
  status: string;
  studio: string;
  released: string;
  type: string;
  season?: string;
  duration: string;
  rating: string;
  genres: GenreItem[];
  episodes: EpisodeItem[];
  related: AnimeCardItem[];
}

export interface VideoServer {
  name: string;
  url: string;
  index: number;
  category: string;
}

export interface WatchData {
  episodeSlug: string;
  title: string;
  animeSlug: string;
  prevEpisode: string;
  nextEpisode: string;
  servers: VideoServer[];
}

export interface ChatMessage {
  id: string;
  room: string;
  username: string;
  text: string;
  color: string;
  createdAt: string;
}

export interface WatchHistoryItem {
  animeSlug: string;
  episodeSlug: string;
  title: string;
  episodeNumber: string;
  image: string;
  watchedAt: number;
}
