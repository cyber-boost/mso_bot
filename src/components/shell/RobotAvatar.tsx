import React from 'react';
import { RobotStatus, BotConfig, THEME } from "@/lib/shell";

interface RobotAvatarProps {
  config: BotConfig;
  status: RobotStatus;
  facing: 'left' | 'right';
  pid: number;
  selected: boolean;
  panic?: boolean;
  panicBounces?: number;
  falling?: boolean;
}

const RobotAvatar: React.FC<RobotAvatarProps> = ({ config, status, facing, pid, selected, panic, panicBounces, falling }) => {
  const isError = status === 'error';
  const isBooting = status === 'booting';
  const isFalling = !!falling;
  const ol = THEME.outline;
  const olW = 2.5;
  const uid = `bot-${config.id}-${pid}`;
  const flip = facing === 'left' ? -1 : 1;
  const baseTransform = `scaleX(${flip})${isFalling ? ' rotate(85deg)' : ''}`;

  return (
    <div
      className="relative w-full h-full transition-all duration-500"
      style={{
        transform: baseTransform,
        transformOrigin: '50% 90%',
        filter: isError ? 'saturate(0.25) brightness(0.85)' : 'none',
      }}
    >
      <div className={panic ? 'panic-hop' : ''} style={{ animationIterationCount: panicBounces || 3 }}>
        {/* Selection glow */}
        {selected && (
          <div className="absolute inset-[-6px] rounded-xl border-2 animate-pulse pointer-events-none"
            style={{ borderColor: THEME.glow, boxShadow: `0 0 14px ${THEME.glowSoft}`, background: `${THEME.glowSoft}` }}
          />
        )}

        {/* Ground shadow */}
        <div className="absolute bottom-[1%] left-[18%] w-[64%] h-[5%] bg-black/12 blur-[2px] rounded-full" />

        <svg viewBox="0 0 100 118" className={`w-full h-full ${isBooting ? 'animate-pulse' : ''}`}>
        <defs>
          <linearGradient id={`hg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.head} />
            <stop offset="100%" stopColor={config.body} />
          </linearGradient>
          <radialGradient id={`eg-${uid}`} cx="40%" cy="38%">
            <stop offset="0%" stopColor="#c8f8f8" />
            <stop offset="45%" stopColor={THEME.eye} />
            <stop offset="100%" stopColor={THEME.eye2} />
          </radialGradient>
          <filter id={`eb-${uid}`}>
            <feGaussianBlur stdDeviation="1.8" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Antenna */}
        <line x1="50" y1="14" x2="50" y2="3" stroke={ol} strokeWidth={olW} strokeLinecap="round" />
        <circle cx="50" cy="2.5" r="3.8" fill={config.antennaBall} stroke={ol} strokeWidth={olW} />

        {/* Bow (feminine bots) */}
        {config.fem && (
          <g transform="translate(64, 7)">
            <ellipse cx="-4.5" cy="0" rx="5.5" ry="3.8" fill={config.accent} stroke={ol} strokeWidth="1.8" />
            <ellipse cx="4.5" cy="0" rx="5.5" ry="3.8" fill={config.accent} stroke={ol} strokeWidth="1.8" />
            <circle cx="0" cy="0" r="2.2" fill={ol} />
          </g>
        )}

        {/* Head — dome */}
        <ellipse cx="50" cy="30" rx="29" ry="23" fill={`url(#hg-${uid})`} stroke={ol} strokeWidth={olW} />
        {/* Head shine */}
        <ellipse cx="39" cy="21" rx="11" ry="5" fill="white" fillOpacity="0.16" />

        {/* Visor */}
        <rect x="28" y="27" width="44" height="15" rx="7" fill={ol} />

        {/* Eyes */}
        {isError ? (
          <g stroke={THEME.error} strokeWidth="2.8" strokeLinecap="round">
            <line x1="35" y1="30" x2="43" y2="38" /><line x1="43" y1="30" x2="35" y2="38" />
            <line x1="57" y1="30" x2="65" y2="38" /><line x1="65" y1="30" x2="57" y2="38" />
          </g>
        ) : (
          <g fill={isBooting ? '#fbbf24' : `url(#eg-${uid})`} filter={`url(#eb-${uid})`}>
            <ellipse cx="39" cy="34" rx="5.5" ry="4.2">
              {!isBooting && <animate attributeName="ry" values="4.2;4.2;0.5;4.2;4.2" dur="4s" repeatCount="indefinite" begin="0s" />}
            </ellipse>
            <ellipse cx="61" cy="34" rx="5.5" ry="4.2">
              {!isBooting && <animate attributeName="ry" values="4.2;4.2;0.5;4.2;4.2" dur="4s" repeatCount="indefinite" begin="0s" />}
            </ellipse>
          </g>
        )}

        {/* Eyelashes (feminine) */}
        {config.fem && !isError && (
          <g stroke={ol} strokeWidth="1.3" strokeLinecap="round">
            <line x1="34" y1="28" x2="33" y2="24.5" />
            <line x1="37" y1="27.5" x2="36.5" y2="24" />
            <line x1="40" y1="27.5" x2="40" y2="24" />
            <line x1="43" y1="28" x2="44" y2="24.5" />
            <line x1="57" y1="28" x2="56" y2="24.5" />
            <line x1="60" y1="27.5" x2="59.5" y2="24" />
            <line x1="63" y1="27.5" x2="63" y2="24" />
            <line x1="66" y1="28" x2="67" y2="24.5" />
          </g>
        )}

        {/* Blush (feminine) */}
        {config.fem && !isError && (
          <g>
            <ellipse cx="27" cy="38" rx="4" ry="2.5" fill="rgba(240,120,140,0.2)" />
            <ellipse cx="73" cy="38" rx="4" ry="2.5" fill="rgba(240,120,140,0.2)" />
          </g>
        )}

        {/* Smile */}
        <path d="M 44 44 Q 50 49 56 44" fill="none" stroke={ol} strokeWidth="2.2" strokeLinecap="round" />

        {/* Body — shield */}
        <path
          d="M 30 55 H 70 Q 79 55 79 65 V 80 Q 79 90 69 90 H 31 Q 21 90 21 80 V 65 Q 21 55 30 55 Z"
          fill={`url(#hg-${uid})`} stroke={ol} strokeWidth={olW}
        />

        {/* Emblem */}
        <circle cx="50" cy="72" r="7.5" fill={ol} stroke={ol} strokeWidth={olW} />
        <circle cx="50" cy="72" r="3.2" fill={config.accent} />

        {/* Arms */}
        <rect x="10" y="61" width="10" height="17" rx="4" fill={ol} />
        <rect x="80" y="61" width="10" height="17" rx="4" fill={ol} />
        {/* Hands */}
        <circle cx="15" cy="80" r="4.5" fill={ol} />
        <circle cx="85" cy="80" r="4.5" fill={ol} />

        {/* Legs with walk animation */}
        <rect x="36" y="91" width="8.5" height="14" rx="2.5" fill={ol}>
          <animateTransform attributeName="transform" type="rotate"
            values="-5,40,91;5,40,91;-5,40,91" dur="0.55s" repeatCount="indefinite" />
        </rect>
        <rect x="56" y="91" width="8.5" height="14" rx="2.5" fill={ol}>
          <animateTransform attributeName="transform" type="rotate"
            values="5,60,91;-5,60,91;5,60,91" dur="0.55s" repeatCount="indefinite" />
        </rect>

        {/* Feet */}
        <ellipse cx="38" cy="106" rx="8.5" ry="4.2" fill={ol} />
        <ellipse cx="62" cy="106" rx="8.5" ry="4.2" fill={ol} />
        </svg>
      </div>

      {/* Error badge */}
      {isError && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[7px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap animate-bounce z-30"
          style={{
            fontFamily: "'Orbitron', sans-serif", letterSpacing: '1.5px',
            background: 'rgba(208,72,72,0.12)', color: THEME.error,
            border: `1.5px solid ${THEME.error}`,
          }}
        >FATAL</div>
      )}
      {isBooting && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[7px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap animate-pulse z-30"
          style={{
            fontFamily: "'Orbitron', sans-serif", letterSpacing: '1.5px',
            background: 'rgba(208,160,48,0.12)', color: THEME.warn,
            border: `1.5px solid ${THEME.warn}`,
          }}
        >INIT</div>
      )}

      {/* PID label */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
        style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '5.5px', fontWeight: 700, color: THEME.glow, letterSpacing: '1px', opacity: 0.45 }}
      >PID:{pid}</div>
    </div>
  );
};

export default RobotAvatar;
