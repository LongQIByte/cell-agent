import type { UploadedFile } from '@codex-remote/protocol';
import type { TurnOverrides } from './turn-settings';

export interface SessionDraft {
  text: string;
  files: UploadedFile[];
  settings: TurnOverrides | null;
  attempt: { key: string; signature: string } | null;
}

export function createSessionDraftStore(
  storage: {
    read: (key: string) => Promise<SessionDraft | null>;
    write: (key: string, draft: SessionDraft) => Promise<void>;
  },
  ordered: boolean,
) {
  const pending = new Map<string, Promise<void>>();
  return {
    async read(key: string) {
      await pending.get(key);
      return storage.read(key);
    },
    write(key: string, draft: SessionDraft) {
      // Browser writes must start in the tap handler, before a possible reload.
      if (!ordered) return storage.write(key, draft);
      const saved = (pending.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(() => storage.write(key, draft));
      pending.set(key, saved);
      const release = () => {
        if (pending.get(key) === saved) pending.delete(key);
      };
      void saved.then(release, release);
      return saved;
    },
  };
}
