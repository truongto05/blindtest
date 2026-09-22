export type MusicTrack = {
  id: string | number;
  title: string;
  artist: string;
  preview: string;
  cover: string;
  artistId?: string;
  isrc?: string;
  genres?: string[];
  sourceIds?: string[];
  popularity?: number;
  year?: number;
};
