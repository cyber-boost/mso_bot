import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Zap, TrendingUp } from 'lucide-react';
import { THEME } from '../types';
import { ptyCommands } from '../utils/tauriApi';

interface GamifiedSession {
  session_id: string;
  robot_name: string;
  robot_type: string;
  experience_points: number;
  level: number;
  achievements: string[];
  commands_executed: number;
  uptime_seconds: number;
}

interface LeaderboardEntry {
  robot_name: string;
  experience_points: number;
  level: number;
  commands_executed: number;
  uptime_seconds: number;
}

interface GamificationPanelProps {
  selectedRobot: any;
  robots?: any[];
  enabled?: boolean;
}

const GamificationPanel: React.FC<GamificationPanelProps> = ({ selectedRobot, enabled = true }) => {
  const [sessionData, setSessionData] = useState<GamifiedSession | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch session data when robot is selected
  useEffect(() => {
    if (selectedRobot?.ptySessionId) {
      fetchSessionData(selectedRobot.ptySessionId);
    }
  }, [selectedRobot]);

  // Event-driven leaderboard: fetch once on mount, then update on gamification events
  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await ptyCommands.getLeaderboard();
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Update on gamification events instead of polling
  useEffect(() => {
    const unlistenXp = ptyCommands.onXpGain(() => {
      fetchLeaderboard();
      // Also refresh selected robot session data
      if (selectedRobot?.ptySessionId) {
        fetchSessionData(selectedRobot.ptySessionId);
      }
    });

    const unlistenAchievement = ptyCommands.onAchievement(() => {
      fetchLeaderboard();
      if (selectedRobot?.ptySessionId) {
        fetchSessionData(selectedRobot.ptySessionId);
      }
    });

    const unlistenLevelUp = ptyCommands.onLevelUp(() => {
      fetchLeaderboard();
      if (selectedRobot?.ptySessionId) {
        fetchSessionData(selectedRobot.ptySessionId);
      }
    });

    return () => {
      unlistenXp.then(fn => fn());
      unlistenAchievement.then(fn => fn());
      unlistenLevelUp.then(fn => fn());
    };
  }, [fetchLeaderboard, selectedRobot]);

  const fetchSessionData = async (sessionId: string) => {
    setLoading(true);
    try {
      const data = await ptyCommands.getGamifiedSession(sessionId);
      setSessionData(data);
    } catch (error) {
      console.error('Failed to fetch session data:', error);
    }
    setLoading(false);
  };

  const getLevelColor = (level: number) => {
    if (level >= 50) return '#FFD700';
    if (level >= 25) return '#C0C0C0';
    if (level >= 10) return '#CD7F32';
    return THEME.glow;
  };

  const getLevelTitle = (level: number) => {
    if (level >= 50) return 'LEGENDARY';
    if (level >= 25) return 'MASTER';
    if (level >= 10) return 'VETERAN';
    if (level >= 5) return 'EXPERT';
    return 'NOVICE';
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Hide when gamification is disabled
  if (!enabled) return null;

  // Compact collapsed view
  const CompactView = () => {
    if (!selectedRobot) {
      return (
        <div className="flex items-center gap-2 px-3 py-2"
          style={{
            background: 'rgba(13,18,32,0.8)',
            border: `1px solid ${THEME.panelBorder}`,
            borderRadius: 4,
            backdropFilter: 'blur(8px)'
          }}>
          <Trophy size={12} color={THEME.glow} />
          <span style={{
            fontFamily: "'Orbitron',sans-serif",
            fontSize: '7px',
            fontWeight: 700,
            color: THEME.glow,
            letterSpacing: '2px'
          }}>
            GAMIFICATION
          </span>
          <span style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: '9px',
            color: 'rgba(58,138,208,0.5)'
          }}>
            Select unit
          </span>
        </div>
      );
    }

    return (
      <div
        className="cursor-pointer px-3 py-2 transition-all duration-300 hover:border-glow/30"
        style={{
          background: 'rgba(13,18,32,0.85)',
          border: `1px solid ${THEME.panelBorder}`,
          borderRadius: 4,
          backdropFilter: 'blur(10px)'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={12} color={THEME.glow} />
            <span style={{
              fontFamily: "'Orbitron',sans-serif",
              fontSize: '7px',
              fontWeight: 700,
              color: THEME.glow,
              letterSpacing: '2px'
            }}>
              LVL {sessionData?.level || '--'}
            </span>
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '7px',
              color: getLevelColor(sessionData?.level || 0)
            }}>
              {getLevelTitle(sessionData?.level || 0)}
            </span>
          </div>
          {sessionData && (
            <div className="flex items-center gap-3">
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '7px', color: THEME.glow }}>
                {sessionData.experience_points} XP
              </span>
              <span style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: '6px',
                color: 'rgba(58,138,208,0.5)'
              }}>
                {expanded ? '▼' : '▲'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Expanded view
  const ExpandedView = () => {
    if (loading) {
      return (
        <div className="absolute top-full left-0 mt-1 p-3 min-w-[180px]"
          style={{
            background: 'rgba(13,18,32,0.95)',
            border: `1px solid ${THEME.panelBorder}`,
            borderRadius: 4,
            backdropFilter: 'blur(10px)'
          }}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: '9px',
            color: 'rgba(58,138,208,0.5)',
            textAlign: 'center'
          }}>
            Loading...
          </div>
        </div>
      );
    }

    if (!sessionData) {
      return (
        <div className="absolute top-full left-0 mt-1 p-3 min-w-[180px]"
          style={{
            background: 'rgba(13,18,32,0.95)',
            border: `1px solid ${THEME.panelBorder}`,
            borderRadius: 4,
            backdropFilter: 'blur(10px)'
          }}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: '9px',
            color: 'rgba(58,138,208,0.5)',
            textAlign: 'center'
          }}>
            No data available
          </div>
        </div>
      );
    }

    return (
      <div className="absolute top-full left-0 mt-1 min-w-[200px] z-50"
        style={{
          background: 'rgba(13,18,32,0.95)',
          border: `1px solid ${THEME.panelBorder}`,
          borderRadius: 4,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}>
        {/* Level & XP */}
        <div className="p-3 border-b" style={{ borderColor: THEME.panelBorder }}>
          <div className="flex justify-between items-center mb-1">
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '8px',
              color: THEME.glow
            }}>
              LEVEL {sessionData.level}
            </span>
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '7px',
              color: getLevelColor(sessionData.level),
              fontWeight: 700
            }}>
              {getLevelTitle(sessionData.level)}
            </span>
          </div>
          <div className="w-full bg-black/40 rounded-full h-1.5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(sessionData.experience_points % 100)}%`,
                background: `linear-gradient(90deg, ${THEME.glow}, ${getLevelColor(sessionData.level)})`
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '6px', color: 'rgba(58,138,208,0.5)' }}>
              {sessionData.experience_points} XP
            </span>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '6px', color: 'rgba(58,138,208,0.5)' }}>
              {100 - (sessionData.experience_points % 100)} to next
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="p-2 flex gap-2 border-b" style={{ borderColor: THEME.panelBorder }}>
          <div className="flex-1 text-center p-1.5 bg-black/20 rounded">
            <Zap size={10} color={THEME.glow} className="mx-auto mb-0.5" />
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '10px',
              color: THEME.glow,
              fontWeight: 700
            }}>
              {sessionData.commands_executed}
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '6px', color: 'rgba(58,138,208,0.5)' }}>
              CMDS
            </div>
          </div>
          <div className="flex-1 text-center p-1.5 bg-black/20 rounded">
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '10px',
              color: THEME.glow,
              fontWeight: 700
            }}>
              {formatUptime(sessionData.uptime_seconds)}
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '6px', color: 'rgba(58,138,208,0.5)' }}>
              UPTIME
            </div>
          </div>
        </div>

        {/* Achievements */}
        {sessionData.achievements.length > 0 && (
          <div className="p-2 border-b" style={{ borderColor: THEME.panelBorder }}>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp size={8} color={THEME.glow} />
              <span style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: '7px',
                color: THEME.glow,
                letterSpacing: '1px'
              }}>
                ACHIEVEMENTS
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {sessionData.achievements.slice(0, 3).map((achievement, index) => (
                <div
                  key={index}
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    background: 'linear-gradient(135deg, rgba(58,138,208,0.2), rgba(58,138,208,0.1))',
                    border: '1px solid rgba(58,138,208,0.3)',
                    color: THEME.glow,
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '6px'
                  }}
                >
                  {achievement}
                </div>
              ))}
              {sessionData.achievements.length > 3 && (
                <span style={{
                  color: 'rgba(58,138,208,0.5)',
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: '6px',
                  padding: '2px 4px'
                }}>
                  +{sessionData.achievements.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="p-2">
            <div className="flex items-center gap-1 mb-1.5">
              <Trophy size={8} color={THEME.glow} />
              <span style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: '7px',
                color: THEME.glow,
                letterSpacing: '1px'
              }}>
                TOP UNITS
              </span>
            </div>
            <div className="space-y-0.5">
              {leaderboard.slice(0, 3).map((entry, index) => (
                <div
                  key={entry.robot_name}
                  className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                    selectedRobot && entry.robot_name === selectedRobot.config.name ? 'bg-black/40' : 'bg-black/10'
                  }`}
                >
                  <span style={{
                    color: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32',
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '7px',
                    fontWeight: 700,
                    width: 14
                  }}>
                    #{index + 1}
                  </span>
                  <span style={{
                    color: THEME.glow,
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '7px',
                    flex: 1
                  }}>
                    {entry.robot_name}
                  </span>
                  <span style={{
                    color: 'rgba(58,138,208,0.7)',
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '6px'
                  }}>
                    Lv.{entry.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute z-30" style={{ top: '70px', left: '15px' }}>
      <CompactView />
      {expanded && <ExpandedView />}
    </div>
  );
};

export default GamificationPanel;
