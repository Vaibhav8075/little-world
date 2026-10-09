/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID (Web application) used for Drive sign-in. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Names the two profiles start with on a fresh install (editable later in Settings). */
  readonly VITE_PARTNER_1_NAME?: string;
  readonly VITE_PARTNER_2_NAME?: string;
  /** Optional existing Drive folder to use as the archive root, if the app can write to it. */
  readonly VITE_DRIVE_ROOT_FOLDER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
