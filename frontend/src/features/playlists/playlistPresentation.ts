import type { PlaylistVisibility } from "../../types/game";

export type Notify = (message: string, type?: "success" | "error") => void;

export const visibilityLabels: Record<PlaylistVisibility, string> = {
  PRIVATE: "Privée",
  UNLISTED: "Partagée par lien",
  PUBLIC: "Publique",
};

export const visibilityDescriptions: Record<PlaylistVisibility, string> = {
  PRIVATE: "Seulement dans ta bibliothèque.",
  UNLISTED: "Toute personne possédant le lien peut la consulter.",
  PUBLIC: "Visible par lien et dans les playlists publiques.",
};

export function shareUrl(shareId: string) {
  return new URL(`/p/${encodeURIComponent(shareId)}`, window.location.origin)
    .href;
}

export function trackCountLabel(count: number) {
  return `${count} titre${count !== 1 ? "s" : ""}`;
}
