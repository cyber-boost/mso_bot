import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Star, Zap } from 'lucide-react';
import { THEME } from '../types';
import { ptyCommands } from '../utils/tauriApi';

interface AchievementEvent {
  robot_name: string;
  achievement: string;
  xp_gained: number;
  new_level?: number;
}

interface DisplayNotification {
  id: string;
  type: 'achievement' | 'level-up' | 'xp-batch';
  robot_name: string;
  achievement?: string;
  xp_gained: number;
  new_level?: number;
  command_count?: number;
}

interface AchievementNotificationProps {
  robots?: any[];
  enabled?: boolean;
}

const XP_BATCH_WINDOW_MS = 2500;
const NOTIFICATION_DISPLAY_MS = 5000;
const XP_DISPLAY_MS = 3000;

const AchievementNotification: React.FC<AchievementNotificationProps> = ({ enabled = true }) => {
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());

  // XP batching state
  const pendingXp = useRef<Map<string, { total: number; count: number }>>(new Map());
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((notif: DisplayNotification) => {
    setNotifications(prev => [...prev.slice(-10), notif]);
    setVisible(prev => new Set([...prev, notif.id]));

    const displayMs = notif.type === 'xp-batch' ? XP_DISPLAY_MS : NOTIFICATION_DISPLAY_MS;
    setTimeout(() => {
      setVisible(prev => {
        const next = new Set(prev);
        next.delete(notif.id);
        return next;
      });
    }, displayMs);
  }, []);

  const flushXpBatch = useCallback(() => {
    pendingXp.current.forEach((data, robotName) => {
      showNotification({
        id: `xp-batch-${Date.now()}-${Math.random()}`,
        type: 'xp-batch',
        robot_name: robotName,
        xp_gained: data.total,
        command_count: data.count,
      });
    });
    pendingXp.current.clear();
    batchTimer.current = null;
  }, [showNotification]);

  useEffect(() => {
    // Achievement events: show individually (they're rare and meaningful)
    const unlistenAchievement = ptyCommands.onAchievement?.((event: AchievementEvent) => {
      showNotification({
        id: `achievement-${Date.now()}-${Math.random()}`,
        type: 'achievement',
        robot_name: event.robot_name,
        achievement: event.achievement,
        xp_gained: event.xp_gained,
      });
    });

    // Level-up events: show individually
    const unlistenLevelUp = ptyCommands.onLevelUp?.((event: AchievementEvent) => {
      showNotification({
        id: `levelup-${Date.now()}-${Math.random()}`,
        type: 'level-up',
        robot_name: event.robot_name,
        xp_gained: event.xp_gained,
        new_level: event.new_level,
      });
    });

    // XP gain events: batch them over a 2.5s window
    const unlistenXp = ptyCommands.onXpGain?.((event: AchievementEvent) => {
      const key = event.robot_name;
      const existing = pendingXp.current.get(key) || { total: 0, count: 0 };
      pendingXp.current.set(key, {
        total: existing.total + (event.xp_gained || 0),
        count: existing.count + 1,
      });

      // Start batch timer if not already running
      if (!batchTimer.current) {
        batchTimer.current = setTimeout(flushXpBatch, XP_BATCH_WINDOW_MS);
      }
    });

    return () => {
      unlistenAchievement?.then(fn => fn());
      unlistenLevelUp?.then(fn => fn());
      unlistenXp?.then(fn => fn());
      if (batchTimer.current) clearTimeout(batchTimer.current);
    };
  }, [showNotification, flushXpBatch]);

  // Hide when gamification is disabled
  if (!enabled) return null;

  const getNotificationIcon = (notif: DisplayNotification) => {
    if (notif.type === 'achievement') return <Trophy size={16} color="#FFD700" />;
    if (notif.type === 'level-up') return <Star size={16} color="#FFD700" />;
    return <Zap size={16} color={THEME.glow} />;
  };

  const getNotificationTitle = (notif: DisplayNotification) => {
    if (notif.type === 'achievement') return 'ACHIEVEMENT UNLOCKED!';
    if (notif.type === 'level-up') return `LEVEL ${notif.new_level}!`;
    return 'XP GAINED';
  };

  const getNotificationMessage = (notif: DisplayNotification) => {
    if (notif.type === 'achievement') return `${notif.robot_name}: ${notif.achievement}`;
    if (notif.type === 'level-up') return `${notif.robot_name} reached level ${notif.new_level}!`;
    if (notif.command_count && notif.command_count > 1) {
      return `${notif.robot_name}: +${notif.xp_gained} XP (${notif.command_count} commands)`;
    }
    return `${notif.robot_name}: +${notif.xp_gained} XP`;
  };

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.map((notif) => {
        const isVisible = visible.has(notif.id);
        const isAchievement = notif.type === 'achievement';
        const isLevelUp = notif.type === 'level-up';

        return (
          <div
            key={notif.id}
            className={`transform transition-all duration-500 pointer-events-auto ${
              isVisible
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
            style={{
              background: isAchievement
                ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1))'
                : isLevelUp
                ? 'linear-gradient(135deg, rgba(58,138,208,0.3), rgba(58,138,208,0.2))'
                : 'linear-gradient(135deg, rgba(58,138,208,0.2), rgba(58,138,208,0.1))',
              border: isAchievement
                ? '1px solid rgba(255,215,0,0.5)'
                : `1px solid ${THEME.glow}`,
              borderRadius: '8px',
              padding: '12px 16px',
              minWidth: '280px',
              maxWidth: '320px',
              boxShadow: isAchievement
                ? '0 4px 20px rgba(255,215,0,0.3)'
                : `0 4px 20px ${THEME.glow}20`,
              backdropFilter: 'blur(10px)'
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {getNotificationIcon(notif)}
              </div>

              <div className="flex-1 min-w-0">
                <div style={{
                  fontFamily: "'Orbitron',sans-serif",
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isAchievement ? '#FFD700' : THEME.glow,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  marginBottom: '4px'
                }}>
                  {getNotificationTitle(notif)}
                </div>

                <div style={{
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: '9px',
                  color: isAchievement ? '#FFD700' : THEME.glow,
                  lineHeight: '1.3',
                  wordBreak: 'break-word'
                }}>
                  {getNotificationMessage(notif)}
                </div>

                {notif.xp_gained > 0 && notif.type !== 'xp-batch' && (
                  <div style={{
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '8px',
                    color: 'rgba(58,138,208,0.6)',
                    marginTop: '4px'
                  }}>
                    +{notif.xp_gained} XP
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AchievementNotification;
