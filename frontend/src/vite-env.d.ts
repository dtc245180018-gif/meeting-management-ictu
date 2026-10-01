/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CURRENT_USER_EMAIL?: string;
  readonly VITE_EMPLOYEE_ONE_EMAIL?: string;
  readonly VITE_EMPLOYEE_TWO_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
