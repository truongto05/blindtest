import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../services/api";
import { copyText } from "../../services/clipboard";
import type { Playlist, PlaylistVisibility } from "../../types/game";
import { PlaylistDialog } from "./PlaylistDialog";
import {
  type Notify,
  shareUrl,
  visibilityDescriptions,
  visibilityLabels,
} from "./playlistPresentation";

type Props = {
  playlist: Playlist;
  ownerId: string;
  notify: Notify;
  onChange: (playlist: Playlist) => void;
  onClose: () => void;
};

const visibilities: PlaylistVisibility[] = ["PRIVATE", "UNLISTED", "PUBLIC"];

export function SharePlaylistDialog({
  playlist,
  ownerId,
  notify,
  onChange,
  onClose,
}: Props) {
  const [visibility, setVisibility] = useState(playlist.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const hasChanges = visibility !== playlist.visibility;
  const url = playlist.shareId ? shareUrl(playlist.shareId) : "";

  const save = async () => {
    if (saving || !hasChanges) return;
    setSaving(true);
    setError("");
    setCopied(false);
    try {
      const updated = await api.setPlaylistVisibility(
        playlist.id,
        ownerId,
        visibility,
      );
      onChange(updated);
      notify(
        visibility === "PRIVATE"
          ? "Playlist privée. L’ancien lien ne fonctionne plus."
          : "Visibilité mise à jour.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La visibilité n’a pas pu être modifiée.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    setError("");
    try {
      await copyText(url);
      setCopied(true);
      notify("Lien de la playlist copié.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sélectionne le lien pour le copier.",
      );
    }
  };

  return (
    <PlaylistDialog
      title="Partager la playlist"
      onClose={onClose}
      busy={saving}
    >
      <fieldset disabled={saving}>
        <legend className="mb-3 text-sm font-semibold text-zinc-300">
          Qui peut la consulter ?
        </legend>
        <div className="space-y-2">
          {visibilities.map((value) => (
            <label
              key={value}
              className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-4 ${visibility === value ? "border-beat-400 bg-beat-500/10" : "border-white/10 hover:bg-white/[.03]"}`}
            >
              <input
                className="mt-1 size-4 shrink-0 accent-beat-400"
                type="radio"
                name="playlist-visibility"
                value={value}
                checked={visibility === value}
                onChange={() => {
                  setVisibility(value);
                  setError("");
                  setCopied(false);
                }}
              />
              <span className="min-w-0 flex-1 break-words">
                <span className="block font-semibold">
                  {visibilityLabels[value]}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-zinc-400">
                  {visibilityDescriptions[value]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {hasChanges && visibility === "PRIVATE" && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          L’ancien lien cessera de fonctionner. Un nouveau lien sera créé si tu
          partages à nouveau cette playlist.
        </p>
      )}
      {hasChanges && (
        <button
          className="btn-primary mt-5 w-full"
          disabled={saving}
          onClick={save}
        >
          {saving && (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          )}
          {saving ? "Enregistrement…" : "Enregistrer la visibilité"}
        </button>
      )}
      {!hasChanges && url && playlist.visibility !== "PRIVATE" && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <label className="label" htmlFor="playlist-share-link">
            Lien de la playlist
          </label>
          <input
            id="playlist-share-link"
            readOnly
            className="field min-w-0 text-sm"
            value={url}
            onFocus={(event) => event.target.select()}
          />
          <button className="btn-secondary mt-3 w-full" onClick={copyLink}>
            {copied ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          <p className="mt-3 text-sm text-zinc-400">
            Les visiteurs peuvent écouter et copier la playlist. Toi seul peux
            modifier cet original.
          </p>
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
    </PlaylistDialog>
  );
}
