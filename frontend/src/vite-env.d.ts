/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Tu peux ajouter ici tes variables d'environnement spécifiques si tu en as (ex: VITE_API_URL)
  readonly VITE_SOCKET_URL?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}