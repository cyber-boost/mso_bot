import { create } from "zustand";
import { isHarness, type Harness, type TraceEvent } from "./harness";
import type { ChatMessage } from "./protocol";
import type { ModelRow, Selection } from "./types";

export type View = "chat" | "catalog" | "harness" | "keys" | "cli" | "play";

export type UiMessage = ChatMessage & { id: string; traces?: TraceEvent[] };

type Keys = Record<string, string>;

type State = {
  hydrated: boolean;
  hydrate: () => void;
  view: View;
  setView: (v: View) => void;
  selection: Selection;
  setSelection: (s: Selection, model?: ModelRow | null) => void;
  selectedModel: ModelRow | null;
  setSelectedModel: (m: ModelRow | null) => void;
  keys: Keys;
  setKey: (providerId: string, key: string) => void;
  clearKey: (providerId: string) => void;
  messages: UiMessage[];
  append: (m: UiMessage) => void;
  patchLast: (content: string, traces?: TraceEvent[]) => void;
  clearMessages: () => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
  temperature: number;
  setTemperature: (n: number) => void;
  maxTokens: number;
  setMaxTokens: (n: number) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (v: boolean) => void;
  harnessId: string;
  setHarnessId: (id: string) => void;
  customHarnesses: Harness[];
  upsertHarness: (h: Harness) => void;
  deleteHarness: (id: string) => void;
};

const KEYS_KEY = "maestro.keys";
const SEL_KEY = "maestro.selection";
const HAR_KEY = "maestro.harness";
const CUST_KEY = "maestro.customs";
const DEFAULT_SEL: Selection = { providerId: "xai", modelId: "grok-4.5" };
const DEFAULT_HARNESS = "open";

function readKeys(): Keys {
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    return raw ? (JSON.parse(raw) as Keys) : {};
  } catch {
    return {};
  }
}

function readSel(): Selection {
  try {
    const raw = localStorage.getItem(SEL_KEY);
    if (raw) return JSON.parse(raw) as Selection;
  } catch {
    /* ignore */
  }
  return DEFAULT_SEL;
}

function readHarnessId(): string {
  try {
    return localStorage.getItem(HAR_KEY) || DEFAULT_HARNESS;
  } catch {
    return DEFAULT_HARNESS;
  }
}

function readCustoms(): Harness[] {
  try {
    const raw = localStorage.getItem(CUST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHarness);
  } catch {
    return [];
  }
}

function persistKeys(keys: Keys) {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function persistSel(sel: Selection) {
  try {
    localStorage.setItem(SEL_KEY, JSON.stringify(sel));
  } catch {
    /* ignore */
  }
}

function persistHarnessId(id: string) {
  try {
    localStorage.setItem(HAR_KEY, id);
  } catch {
    /* ignore */
  }
}

function persistCustoms(list: Harness[]) {
  try {
    localStorage.setItem(CUST_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const useMaestro = create<State>((set) => ({
  hydrated: false,
  hydrate: () =>
    set({
      hydrated: true,
      keys: readKeys(),
      selection: readSel(),
      harnessId: readHarnessId(),
      customHarnesses: readCustoms(),
    }),
  view: "chat",
  setView: (view) => set({ view }),
  selection: DEFAULT_SEL,
  selectedModel: null,
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setSelection: (selection, model) => {
    persistSel(selection);
    set({
      selection,
      selectedModel: model ?? null,
      messages: [],
    });
  },
  keys: {},
  setKey: (providerId, key) =>
    set((s) => {
      const keys = { ...s.keys, [providerId]: key };
      persistKeys(keys);
      return { keys };
    }),
  clearKey: (providerId) =>
    set((s) => {
      const keys = { ...s.keys };
      delete keys[providerId];
      persistKeys(keys);
      return { keys };
    }),
  messages: [],
  append: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patchLast: (content, traces) =>
    set((s) => {
      const next = s.messages.slice();
      const last = next[next.length - 1];
      if (!last) return s;
      next[next.length - 1] = {
        ...last,
        content,
        traces: traces ?? last.traces,
      };
      return { messages: next };
    }),
  clearMessages: () => set({ messages: [] }),
  systemPrompt: "",
  setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
  temperature: 0.7,
  setTemperature: (temperature) => set({ temperature }),
  maxTokens: 768,
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  inspectorOpen: false,
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  harnessId: DEFAULT_HARNESS,
  setHarnessId: (harnessId) => {
    persistHarnessId(harnessId);
    set({ harnessId, messages: [] });
  },
  customHarnesses: [],
  upsertHarness: (h) =>
    set((s) => {
      const i = s.customHarnesses.findIndex((x) => x.id === h.id);
      const customHarnesses =
        i === -1
          ? [...s.customHarnesses, h]
          : s.customHarnesses.map((x) => (x.id === h.id ? h : x));
      persistCustoms(customHarnesses);
      return { customHarnesses };
    }),
  deleteHarness: (id) =>
    set((s) => {
      const customHarnesses = s.customHarnesses.filter((x) => x.id !== id);
      persistCustoms(customHarnesses);
      const harnessId = s.harnessId === id ? DEFAULT_HARNESS : s.harnessId;
      if (harnessId !== s.harnessId) persistHarnessId(harnessId);
      return { customHarnesses, harnessId };
    }),
}));
