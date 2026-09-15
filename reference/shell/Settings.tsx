import React, { useState, useEffect, useCallback } from 'react';
import { THEME, RobotEntity } from '../types';
import { Provider, PROVIDERS, detectProviders } from '../utils/providers';
import { llmCommands } from '../utils/tauriApi';
import {
  XCircle, Check, AlertCircle, Loader2, Plus,
  Wifi, WifiOff, Bot, Activity, Cpu, ChevronDown, ChevronRight, Star,
} from 'lucide-react';

type SettingsTab = 'theme' | 'providers' | 'agents' | 'models';

interface SettingsProps {
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onClose: () => void;
  robots?: RobotEntity[];
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'theme', label: 'THEME' },
  { id: 'providers', label: 'PROVIDERS' },
  { id: 'agents', label: 'AGENTS' },
  { id: 'models', label: 'MODELS' },
];

const fontMono = { fontFamily: "'Share Tech Mono', monospace" };
const fontTitle = { fontFamily: "'Orbitron', sans-serif" };

// --- Default models per provider (fallback when backend unavailable) ---
const DEFAULT_MODELS: Record<string, string[]> = {
  ollama: ['llama3', 'llama3:70b', 'codellama', 'mistral', 'mixtral', 'phi3', 'gemma2'],
  anthropic: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-sonnet-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  azure: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'],
  huggingface: ['meta-llama/Llama-3-8b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  cohere: ['command-r-plus', 'command-r', 'command-light'],
};

const Settings: React.FC<SettingsProps> = ({ theme, onThemeChange, onClose, robots = [] }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');

  // --- Providers state ---
  const [providers, setProviders] = useState<Provider[]>(PROVIDERS);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState('');

  // --- Models state ---
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({});
  const [defaultModel, setDefaultModel] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('nebula-default-models');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Detect providers on mount
  const refreshProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const detected = await detectProviders();
      setProviders(detected);
    } catch {
      setProviders(PROVIDERS);
    }
    setProvidersLoading(false);
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // Save default model choices to localStorage
  useEffect(() => {
    localStorage.setItem('nebula-default-models', JSON.stringify(defaultModel));
  }, [defaultModel]);

  // Fetch models for a provider
  const fetchModels = useCallback(async (providerId: string) => {
    setModelsLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      const models = await llmCommands.getModelList(providerId);
      if (models && models.length > 0) {
        setModelsByProvider(prev => ({ ...prev, [providerId]: models }));
      } else {
        setModelsByProvider(prev => ({ ...prev, [providerId]: DEFAULT_MODELS[providerId] || [] }));
      }
    } catch {
      setModelsByProvider(prev => ({ ...prev, [providerId]: DEFAULT_MODELS[providerId] || [] }));
    }
    setModelsLoading(prev => ({ ...prev, [providerId]: false }));
  }, []);

  // --- Render helpers ---
  const statusBadge = (status: string) => {
    const isOnline = status === 'idle' || status === 'moving';
    const isError = status === 'error';
    return (
      <span className="px-1.5 py-0.5 rounded text-[8px]" style={{
        ...fontMono,
        background: isError ? 'rgba(220,90,90,0.15)' : isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(58,138,208,0.15)',
        color: isError ? 'rgba(220,90,90,0.9)' : isOnline ? 'rgba(34,197,94,0.8)' : THEME.glow,
      }}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${THEME.panelBorder}` }}>
        <div style={{ ...fontTitle, fontSize: '11px', fontWeight: 700, color: THEME.glow, letterSpacing: '2px' }}>
          SETTINGS
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-red-400 transition-colors">
          <XCircle size={16} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: `1px solid ${THEME.panelBorder}` }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2.5 transition-all"
            style={{
              ...fontMono,
              fontSize: '9px',
              letterSpacing: '2px',
              color: activeTab === tab.id ? THEME.glow : 'rgba(130,180,220,0.4)',
              borderBottom: activeTab === tab.id ? `2px solid ${THEME.glow}` : '2px solid transparent',
              background: activeTab === tab.id ? 'rgba(58,138,208,0.06)' : 'transparent',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5 terminal-scroll">

        {/* ═══ THEME TAB ═══ */}
        {activeTab === 'theme' && (
          <div>
            <div className="mb-4" style={{ ...fontMono, fontSize: '10px', color: THEME.glow, letterSpacing: '1px' }}>
              APPEARANCE
            </div>
            <div className="flex gap-3">
              <button onClick={() => onThemeChange('light')}
                className="flex-1 p-4 rounded-lg transition-all"
                style={{
                  border: `1px solid ${theme === 'light' ? THEME.glow : THEME.panelBorder}`,
                  background: theme === 'light' ? 'rgba(58,138,208,0.08)' : 'transparent',
                }}>
                <div className="text-center">
                  <div style={{ fontSize: '24px', marginBottom: 8 }}>&#9728;</div>
                  <div style={{ ...fontMono, fontSize: '10px', fontWeight: 700, color: THEME.glow }}>LIGHT</div>
                </div>
              </button>
              <button onClick={() => onThemeChange('dark')}
                className="flex-1 p-4 rounded-lg transition-all"
                style={{
                  border: `1px solid ${theme === 'dark' ? THEME.glow : THEME.panelBorder}`,
                  background: theme === 'dark' ? 'rgba(58,138,208,0.08)' : 'transparent',
                }}>
                <div className="text-center">
                  <div style={{ fontSize: '24px', marginBottom: 8 }}>&#127769;</div>
                  <div style={{ ...fontMono, fontSize: '10px', fontWeight: 700, color: THEME.glow }}>DARK</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ═══ PROVIDERS TAB ═══ */}
        {activeTab === 'providers' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div style={{ ...fontMono, fontSize: '10px', color: THEME.glow, letterSpacing: '1px' }}>
                CONFIGURED PROVIDERS
              </div>
              <button onClick={refreshProviders} disabled={providersLoading}
                className="px-2 py-1 rounded text-[8px] transition-all hover:bg-white/[0.06]"
                style={{ ...fontMono, color: THEME.glow, border: `1px solid rgba(58,138,208,0.15)` }}>
                {providersLoading ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
                SCAN KEYS
              </button>
            </div>

            {providers.map(provider => {
              const isAdding = addingKey === provider.id;
              return (
                <div key={provider.id} className="mb-2 rounded-lg transition-all"
                  style={{ border: `1px solid ${provider.detected || provider.local ? 'rgba(80,200,130,0.15)' : THEME.panelBorder}`,
                    background: provider.detected || provider.local ? 'rgba(80,200,130,0.03)' : 'transparent' }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span style={{ ...fontTitle, fontSize: '14px', width: 28, textAlign: 'center', color: THEME.glow }}>
                      {provider.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ ...fontMono, fontSize: '12px', fontWeight: 700, color: THEME.glow }}>
                          {provider.name}
                        </span>
                        {provider.local && (
                          <span className="px-1.5 py-0.5 rounded text-[7px]"
                            style={{ ...fontMono, background: 'rgba(180,130,220,0.12)', color: 'rgba(180,130,220,0.7)' }}>
                            LOCAL
                          </span>
                        )}
                      </div>
                      <div style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.4)' }}>
                        {provider.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {provider.local ? (
                        <Wifi size={14} color="rgba(80,200,130,0.7)" />
                      ) : provider.detected ? (
                        <div className="flex items-center gap-1">
                          <Check size={14} color="rgba(80,200,130,0.7)" />
                          <span style={{ ...fontMono, fontSize: '8px', color: 'rgba(80,200,130,0.6)' }}>
                            {provider.maskedKey}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <WifiOff size={12} color="rgba(255,255,255,0.2)" />
                          {!isAdding && (
                            <button onClick={() => { setAddingKey(provider.id); setNewKeyValue(''); }}
                              className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                              title="Add API key">
                              <Plus size={12} color={THEME.glow} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline key entry */}
                  {isAdding && (
                    <div className="px-4 pb-3 flex gap-2">
                      <input value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)}
                        type="password" autoFocus
                        className="flex-1 px-2 py-1.5 rounded border bg-white/5"
                        style={{ ...fontMono, fontSize: '10px', borderColor: THEME.panelBorder, color: THEME.glow }}
                        placeholder={`Paste ${provider.envKey}`}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setAddingKey(null); setNewKeyValue(''); }
                        }}
                      />
                      <button onClick={() => { setAddingKey(null); setNewKeyValue(''); }}
                        className="px-2 py-1 rounded text-[9px] transition-colors hover:bg-white/[0.06]"
                        style={{ ...fontMono, color: 'rgba(255,255,255,0.4)', border: `1px solid ${THEME.panelBorder}` }}>
                        ESC
                      </button>
                      <button onClick={() => {
                        if (newKeyValue.trim()) {
                          // Mark as detected locally for this session
                          setProviders(prev => prev.map(p =>
                            p.id === provider.id ? { ...p, detected: true, maskedKey: `...${newKeyValue.trim().slice(-4)}` } : p
                          ));
                          setAddingKey(null);
                          setNewKeyValue('');
                        }
                      }} disabled={!newKeyValue.trim()}
                        className="px-2 py-1 rounded text-[9px] transition-colors"
                        style={{
                          ...fontMono,
                          background: newKeyValue.trim() ? 'rgba(80,200,130,0.15)' : 'transparent',
                          color: newKeyValue.trim() ? 'rgba(80,200,130,0.8)' : 'rgba(255,255,255,0.2)',
                          border: `1px solid ${newKeyValue.trim() ? 'rgba(80,200,130,0.3)' : THEME.panelBorder}`,
                        }}>
                        SAVE
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-4 px-2 py-2 rounded" style={{ background: 'rgba(58,138,208,0.04)' }}>
              <div style={{ ...fontMono, fontSize: '8px', color: 'rgba(130,180,220,0.3)', lineHeight: '1.6' }}>
                Keys are auto-detected from environment variables and ~/.mso/symphony.json.
                <br />
                Added keys are session-only. For persistence, set them in your shell profile.
              </div>
            </div>
          </div>
        )}

        {/* ═══ AGENTS TAB ═══ */}
        {activeTab === 'agents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div style={{ ...fontMono, fontSize: '10px', color: THEME.glow, letterSpacing: '1px' }}>
                ACTIVE AGENTS
              </div>
              <span style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.4)' }}>
                {robots.length} deployed
              </span>
            </div>

            {robots.length === 0 ? (
              <div className="text-center py-8">
                <Bot size={32} color="rgba(130,180,220,0.15)" className="mx-auto mb-3" />
                <div style={{ ...fontMono, fontSize: '11px', color: 'rgba(130,180,220,0.4)' }}>
                  No agents deployed yet.
                </div>
                <div style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.25)', marginTop: 4 }}>
                  Deploy from the arena ring to get started.
                </div>
              </div>
            ) : (
              robots.map(robot => (
                <div key={robot.id} className="mb-2 rounded-lg"
                  style={{ border: `1px solid ${THEME.panelBorder}`, background: 'rgba(58,138,208,0.02)' }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: robot.config.head, boxShadow: `0 0 6px ${robot.config.head}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ ...fontMono, fontSize: '12px', fontWeight: 700, color: THEME.glow }}>
                          {robot.displayName}
                        </span>
                        {statusBadge(robot.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-1" style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.4)' }}>
                        <span>PID {robot.pid}</span>
                        <span>Provider: {robot.provider || 'Local'}</span>
                        <span>PTY: {robot.ptyActive ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {robot.ptyActive ? (
                        <Activity size={14} color="rgba(34,197,94,0.6)" />
                      ) : (
                        <Cpu size={14} color="rgba(255,255,255,0.15)" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="mt-4 px-2 py-2 rounded" style={{ background: 'rgba(58,138,208,0.04)' }}>
              <div style={{ ...fontMono, fontSize: '8px', color: 'rgba(130,180,220,0.3)', lineHeight: '1.6' }}>
                Agents run in isolated PTY sessions with gamified tracking.
                <br />
                Pulse runtime configuration lives at ~/.nebula/
              </div>
            </div>
          </div>
        )}

        {/* ═══ MODELS TAB ═══ */}
        {activeTab === 'models' && (
          <div>
            <div className="mb-4" style={{ ...fontMono, fontSize: '10px', color: THEME.glow, letterSpacing: '1px' }}>
              AVAILABLE MODELS
            </div>

            {/* Always show all known providers so user can browse/select models */}
            {providers.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle size={32} color="rgba(220,180,60,0.3)" className="mx-auto mb-3" />
                <div style={{ ...fontMono, fontSize: '11px', color: 'rgba(130,180,220,0.4)' }}>
                  No providers available.
                </div>
              </div>
            ) : (
              providers.map(provider => {
                const isExpanded = expandedProvider === provider.id;
                const models = modelsByProvider[provider.id] || [];
                const isLoading = modelsLoading[provider.id];
                const currentDefault = defaultModel[provider.id];

                return (
                  <div key={provider.id} className="mb-2 rounded-lg"
                    style={{ border: `1px solid ${THEME.panelBorder}` }}>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/[0.03]"
                      onClick={() => {
                        const next = isExpanded ? null : provider.id;
                        setExpandedProvider(next);
                        if (next) {
                          // Always try to fetch from backend; defaults will be used as fallback
                          if (models.length === 0 && !isLoading) {
                            // Pre-populate with defaults immediately so UI is never empty
                            if (DEFAULT_MODELS[provider.id]) {
                              setModelsByProvider(prev => ({ ...prev, [provider.id]: DEFAULT_MODELS[provider.id] }));
                            }
                            fetchModels(provider.id);
                          }
                        }
                      }}>
                      <span style={{ ...fontTitle, fontSize: '13px', width: 24, textAlign: 'center', color: THEME.glow }}>
                        {provider.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span style={{ ...fontMono, fontSize: '11px', fontWeight: 700, color: THEME.glow }}>
                            {provider.name}
                          </span>
                          {(provider.detected || provider.local) ? (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(34,197,94,0.7)' }} title="Connected" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} title="Not connected" />
                          )}
                        </div>
                        {currentDefault && (
                          <div className="text-[8px] mt-0.5" style={{ ...fontMono, color: 'rgba(130,180,220,0.4)' }}>
                            Default: {currentDefault}
                          </div>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronDown size={14} color={THEME.glow} />
                        : <ChevronRight size={14} color="rgba(130,180,220,0.3)" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3" style={{ borderTop: `1px solid ${THEME.panelBorder}` }}>
                        {isLoading ? (
                          <div className="py-3 text-center">
                            <Loader2 size={16} color={THEME.glow} className="animate-spin inline mr-2" />
                            <span style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.4)' }}>
                              Fetching models...
                            </span>
                          </div>
                        ) : models.length === 0 ? (
                          <div className="py-3 text-center" style={{ ...fontMono, fontSize: '9px', color: 'rgba(130,180,220,0.3)' }}>
                            No models available. Check provider connectivity.
                          </div>
                        ) : (
                          <div className="pt-2 space-y-1">
                            {models.map(model => {
                              const isDefault = currentDefault === model;
                              return (
                                <button key={model} onClick={() => {
                                  setDefaultModel(prev => ({ ...prev, [provider.id]: model }));
                                }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-left transition-all hover:bg-white/[0.04]"
                                  style={{
                                    border: isDefault ? `1px solid rgba(58,138,208,0.3)` : '1px solid transparent',
                                    background: isDefault ? 'rgba(58,138,208,0.06)' : 'transparent',
                                  }}>
                                  {isDefault ? (
                                    <Star size={10} color={THEME.glow} fill={THEME.glow} />
                                  ) : (
                                    <Star size={10} color="rgba(130,180,220,0.15)" />
                                  )}
                                  <span style={{
                                    ...fontMono, fontSize: '10px',
                                    color: isDefault ? THEME.glow : 'rgba(130,180,220,0.6)',
                                    fontWeight: isDefault ? 700 : 400,
                                  }}>
                                    {model}
                                  </span>
                                  {isDefault && (
                                    <span className="ml-auto text-[7px] px-1.5 py-0.5 rounded"
                                      style={{ ...fontMono, background: 'rgba(58,138,208,0.12)', color: THEME.glow }}>
                                      DEFAULT
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div className="mt-4 px-2 py-2 rounded" style={{ background: 'rgba(58,138,208,0.04)' }}>
              <div style={{ ...fontMono, fontSize: '8px', color: 'rgba(130,180,220,0.3)', lineHeight: '1.6' }}>
                Click a model to set it as the default for that provider.
                <br />
                Ollama models are served locally. Cloud models require a valid API key.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
