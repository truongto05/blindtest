import { Link } from "react-router-dom";
import Brand from "../Brand";
import PulseSignal from "../PulseSignal";

export function PageLoading({
  title = "Chargement en cours",
  text = "Encore un instant…",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <main
      id="main-content"
      className="page items-center justify-center text-center"
      aria-busy="true"
    >
      <Brand className="mb-8" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-md text-zinc-400" role="status">
        {text}
      </p>
      <PulseSignal animated className="mt-6" />
      <Link className="btn-ghost mt-6" to="/">
        Retour à l’accueil
      </Link>
    </main>
  );
}

export function PageNotFound() {
  return (
    <main
      id="main-content"
      className="page items-center justify-center text-center"
    >
      <Brand className="mb-8" />
      <p className="font-mono text-sm text-beat-300">404 / Piste introuvable</p>
      <h1 className="mt-3 text-3xl font-semibold">Cette page n’existe pas</h1>
      <p className="mt-3 text-zinc-400">
        Vérifie le lien ou retrouve ta bibliothèque.
      </p>
      <Link className="btn-primary mt-6" to="/">
        Retour à l’accueil
      </Link>
    </main>
  );
}
