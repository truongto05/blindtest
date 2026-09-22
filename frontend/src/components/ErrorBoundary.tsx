import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        id="main-content"
        className="page items-center justify-center text-center"
      >
        <h1 className="text-3xl font-black">Pulse a rencontré un imprévu</h1>
        <p className="mt-4 max-w-md text-zinc-400">
          Tes playlists enregistrées ne sont pas supprimées. Recharge la page
          pour reprendre.
        </p>
        <button
          className="btn-primary mt-6"
          onClick={() => window.location.reload()}
        >
          Recharger la page
        </button>
        <a className="btn-ghost mt-3" href="/">
          Retour à l’accueil
        </a>
      </main>
    );
  }
}
