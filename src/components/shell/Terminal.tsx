import React, { useEffect, useRef } from 'react';
import { LogEntry, THEME } from "@/lib/shell";
import { Terminal as TermIcon, Maximize2 } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  logs?: LogEntry[];
  selectedPid?: number | null;
  ptyOutput?: string[];
  title?: string;
  sessionId?: string; // stable key for xterm lifecycle
  onOpenFullscreen?: () => void;
  onInput?: (data: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs = [], selectedPid = null, ptyOutput, title, sessionId, onOpenFullscreen, onInput }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const xtermElRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef(0);
  // Store onInput in a ref so xterm doesn't recreate when it changes
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const filtered = selectedPid ? logs.filter(l => l.pid === selectedPid) : logs;

  const levelStyle = (lv: LogEntry['level']) => {
    switch (lv) {
      case 'error':   return { color: 'rgba(220,90,90,0.9)', bg: 'rgba(220,90,90,0.08)', icon: '✕', bold: true };
      case 'warn':    return { color: 'rgba(220,180,60,0.85)', bg: 'transparent', icon: '⚠', bold: false };
      case 'success': return { color: 'rgba(80,200,130,0.85)', bg: 'transparent', icon: '✓', bold: false };
      default:        return { color: 'rgba(130,180,220,0.8)', bg: 'transparent', icon: '›', bold: false };
    }
  };

  // Create xterm ONCE per sessionId — stable lifecycle, no flicker
  useEffect(() => {
    if (!sessionId || !xtermElRef.current) return;

    // Clean up old terminal if exists
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
      lastIndexRef.current = 0;
    }

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: 12,
      lineHeight: 1.2,
      cursorStyle: 'bar',
      convertEol: false,
      theme: {
        background: '#0d1220',
        foreground: 'rgba(220,240,255,0.9)',
        cursor: 'rgba(220,240,255,0.9)',
        cursorAccent: 'rgba(220,240,255,0.5)',
        black: '#1a2744',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#00d4ff',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: 'rgba(220,240,255,0.9)',
        brightBlack: 'rgba(220,240,255,0.4)',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fcd34d',
        brightBlue: '#38bdf8',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: 'rgba(220,240,255,1)',
      },
    });

    term.open(xtermElRef.current);
    xtermRef.current = term;

    // Write welcome banner
    term.writeln('\x1b[36m\x1b[1m  NEBULA CORE TERMINAL\x1b[0m');
    term.writeln('\x1b[90m  Session active | Mode: Gamified\x1b[0m');
    term.writeln('');

    // Handle input — use ref so handler stays current without recreating xterm
    term.onData((data) => {
      if (onInputRef.current) onInputRef.current(data);
    });
    term.focus();

    // Click to focus
    const el = xtermElRef.current;
    if (el) {
      el.style.cursor = 'text';
      const clickHandler = () => term.focus();
      el.addEventListener('click', clickHandler);
    }

    // Fit terminal to container
    const fit = () => {
      try {
        if (term.element && term.element.parentElement) {
          const parentWidth = term.element.parentElement.clientWidth;
          const parentHeight = term.element.parentElement.clientHeight;
          const cols = Math.floor(parentWidth / 8.4);
          const rows = Math.floor(parentHeight / 18);
          if (cols > 0 && rows > 0) {
            term.resize(cols, rows);
          }
        }
      } catch (_e) {
        // Ignore fit errors
      }
    };

    // Fit once after a short delay (DOM needs to settle), then periodically
    setTimeout(fit, 50);
    const fitInterval = setInterval(fit, 1000);

    return () => {
      clearInterval(fitInterval);
      term.dispose();
      xtermRef.current = null;
      lastIndexRef.current = 0;
    };
  }, [sessionId]); // ONLY recreate when sessionId changes — NOT on every render

  // Tear down xterm when switching away from PTY mode
  useEffect(() => {
    if (!sessionId && xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
      lastIndexRef.current = 0;
    }
  }, [sessionId]);

  // Stream new PTY output into xterm incrementally
  useEffect(() => {
    if (!ptyOutput || !xtermRef.current) return;

    // If output was cleared/reset
    if (ptyOutput.length < lastIndexRef.current) {
      xtermRef.current.reset();
      lastIndexRef.current = 0;
    }

    const next = ptyOutput.slice(lastIndexRef.current).join('');
    if (next) {
      xtermRef.current.write(next);
      lastIndexRef.current = ptyOutput.length;
    }
  }, [ptyOutput]);

  const isPtyMode = !!sessionId;

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: THEME.termBg }}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ background: THEME.termHeader, borderBottom: '1px solid rgba(58,138,208,0.1)' }}>
        <div className="flex items-center gap-[5px]">
          <TermIcon size={11} color={THEME.glow} />
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: '7px', fontWeight: 700, color: THEME.glow, letterSpacing: '2px' }}>
            {title || `TERMINAL ${selectedPid ? `[PID:${selectedPid}]` : '[ALL]'}`}
          </span>
        </div>
        <div className="flex gap-1">
          {isPtyMode && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px]"
              style={{ background: 'rgba(34,197,94,0.15)', color: 'rgba(34,197,94,0.8)', fontFamily: "'Share Tech Mono',monospace" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgba(34,197,94,0.8)' }} />
              INPUT ACTIVE
            </span>
          )}
          {onOpenFullscreen ? (
            <button className="p-1 rounded hover:bg-white/[0.06] transition-colors"
              onClick={onOpenFullscreen} title="Open fullscreen terminal">
              <Maximize2 size={12} color={THEME.glow} />
            </button>
          ) : (
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: 'rgba(208,72,72,0.5)' }} />
          )}
        </div>
      </div>

      {/* CRT scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'repeating-linear-gradient(180deg,transparent 0,transparent 2px,rgba(0,0,0,0.08)2px,rgba(0,0,0,0.08)4px)', opacity: 0.15 }} />


      <div ref={containerRef} className="flex-1 overflow-hidden relative z-0">
        {isPtyMode ? (
          <div className="h-full w-full" style={{ minHeight: 0 }}>
            {(!ptyOutput || ptyOutput.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', fontSize: '9px', fontFamily: "'Share Tech Mono',monospace" }}>
                <div className="text-center">
                  <div className="mb-1">Awaiting process output...</div>
                  <div className="opacity-50">[Click to focus & type]</div>
                </div>
              </div>
            )}
            <div ref={xtermElRef} className="h-full w-full" style={{ minHeight: 0 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center pt-8" style={{ color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', fontSize: '9px', fontFamily: "'Share Tech Mono',monospace" }}>
            Awaiting process output...
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-2 terminal-scroll"
            style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '10px', lineHeight: '1.6' }}>
            {filtered.slice(-80).map((log) => {
              const s = levelStyle(log.level);
              return (
                <div key={log.id} className="flex gap-[5px] px-[2px] py-[1px] rounded-[2px] transition-colors hover:bg-white/[0.03]">
                  <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontSize: '9px' }}>[{log.timestamp}]</span>
                  <span style={{ color: 'rgba(58,138,208,0.4)', flexShrink: 0, fontSize: '9px' }}>PID:{log.pid}</span>
                  <span style={{ color: s.color, fontSize: '9px', flexShrink: 0 }}>{s.icon}</span>
                  <span className="break-all" style={{
                    color: s.color, background: s.bg, fontWeight: s.bold ? 700 : 400,
                    padding: s.bold ? '0 4px' : '0', borderRadius: '2px',
                  }}>{log.message}</span>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Terminal;
