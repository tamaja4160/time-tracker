/**
 * Minimal TypeScript declarations for the Google Picker API.
 * The full API is loaded at runtime via https://apis.google.com/js/api.js.
 * We declare only the subset FocusLog uses.
 */

export interface PickerDocument {
  /** The Drive file ID of the selected item. */
  id: string;
  /** The display name of the selected item. */
  name: string;
  /** The MIME type of the selected item. */
  mimeType: string;
}

export interface PickerResponse {
  /** The user's action: "picked" or "cancel". */
  action: 'picked' | 'cancel' | string;
  /** Selected documents (present when action is "picked"). */
  docs?: PickerDocument[];
}

declare global {
  interface Window {
    gapi?: {
      load(library: string, callback: () => void): void;
      client?: unknown;
    };
    google?: {
      accounts: { oauth2: unknown };
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId?: string) => GoogleDocsView;
        DocsViewMode: { LIST: string; GRID: string };
        ViewId: { SPREADSHEETS: string };
        Action: { PICKED: string; CANCEL: string };
      };
    };
  }
}

export interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setMode(mode: string): GoogleDocsView;
}

export interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setAppId(appId: string): GooglePickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): GooglePickerBuilder;
  setTitle(title: string): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
