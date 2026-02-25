

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { Profile, GameScreen, GameConfig, Result, Settings, CampaignOp, TimerMode, ArcadeMode, SoundFunctions, PracticeDifficulty, Theme, Language } from './types';
import { MathEngine } from './services/mathEngine';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ACHIEVEMENTS_DATA } from './constants';
import { ErrorBoundary } from './components/ErrorBoundary';

// Screens
import { Splash } from './components/screens/Splash';
import { Dashboard } from './components/screens/Dashboard';
import { LevelMap } from './components/screens/LevelMap';
import { GameArena } from './components/screens/GameArena';
import { CharacterBuilder } from './components/screens/CharacterBuilder';
import { Calculator } from './components/screens/Calculator';

// Modals
import { SettingsModal } from './components/modals/SettingsModal';
import { AchievementsModal } from './components/modals/AchievementsModal';
import { ResultModal } from './components/modals/ResultModal';


const App: React.FC = () => {
  const [screen, setScreen] = useState<GameScreen>(GameScreen.SPLASH);
  const [profile, setProfile] = useState<Profile>(() => {
    try {
      const savedProfile = localStorage.getItem('math_profile');
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile);
        // Ensure avatar defaults if not present in old profiles
        return {
          ...parsedProfile,
          name: parsedProfile.name || '',
          avatarShape: parsedProfile.avatarShape || 'Circle',
          avatarColor: parsedProfile.avatarColor || 'neon-blue',
        };
      }
    } catch (error) {
      console.warn('Failed to parse saved profile, resetting to defaults:', error);
      localStorage.removeItem('math_profile');
    }
    // Default profile for new users before character creation
    return {
      name: '', // Empty name indicates a new user needing to build character
      avatarShape: 'Circle', // Default for initial state, will be overwritten
      avatarColor: 'neon-blue', // Default for initial state, will be overwritten
      campaign: {
        [CampaignOp.ADD]: 0,
        [CampaignOp.SUB]: 0,
        [CampaignOp.MUL]: 0,
        [CampaignOp.DIV]: 0,
        [CampaignOp.VISUAL_DOTS]: 0,
        [CampaignOp.VISUAL_TRIANGLES]: 0,
        [CampaignOp.VISUAL_STARS]: 0,
      },
      arcade: {
        [ArcadeMode.SCORE_ATTACK]: 0,
        [ArcadeMode.ENDLESS]: 0,
        [ArcadeMode.DUEL]: 0,
        [ArcadeMode.FLASH]: 0,
        [ArcadeMode.MARATHON]: 0,
      },
      unlockedAchievements: [],
      stats: { zenLevels: 0 }
    };
  });
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const savedSettings = localStorage.getItem('math_settings');
      if (savedSettings) {
        return JSON.parse(savedSettings);
      }
    } catch (error) {
      console.warn('Failed to parse saved settings, using defaults:', error);
      localStorage.removeItem('math_settings');
    }
    return {
      timerMode: TimerMode.TIME_60,
      practiceDifficulty: PracticeDifficulty.EASY,
      theme: Theme.SIMULATION,
      language: Language.ENGLISH,
    };
  });
  // Remove duplicate theme state - use only settings.theme
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('theme') !== 'light');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    // Sync isDark with theme for backwards compatibility
    const shouldBeDark = settings.theme !== Theme.PAPER;
    if (isDark !== shouldBeDark) {
      setIsDark(shouldBeDark);
    }
  }, [settings.theme]);

  // UI State for Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  // Audio
  const sounds = useRef<SoundFunctions | null>(null);
  const audioInitializedRef = useRef(false); // New ref to track audio initialization

  const initAudio = useCallback(async () => {
    if (!audioInitializedRef.current) {
      await Tone.start();
      const synth = new Tone.PolySynth(Tone.Synth).toDestination();
      const plucky = new Tone.PluckSynth().toDestination();
      sounds.current = {
        click: () => synth.triggerAttackRelease("C5", "32n", undefined, 0.1),
        start: () => synth.triggerAttackRelease(["C4", "E4", "G4", "C5"], "8n"),
        correct: () => { plucky.triggerAttack("C5"); setTimeout(() => plucky.triggerAttack("E5"), 100); },
        wrong: () => plucky.triggerAttack("A2"),
        tick: () => synth.triggerAttackRelease("C6", "32n", undefined, 0.05),
        win: () => {
          const now = Tone.now();
          synth.triggerAttackRelease("C4", "8n", now);
          synth.triggerAttackRelease("E4", "8n", now + 0.1);
          synth.triggerAttackRelease("G4", "8n", now + 0.2);
          synth.triggerAttackRelease("C5", "2n", now + 0.3);
        }
      };
      audioInitializedRef.current = true;
    }
  }, []);

  const playSound = useCallback((type: keyof SoundFunctions) => {
    if (sounds.current) {
      sounds.current[type]();
    }
  }, []);

  // Save profile to local storage
  useEffect(() => {
    localStorage.setItem('math_profile', JSON.stringify(profile));
  }, [profile]);

  // Save settings to local storage
  useEffect(() => {
    localStorage.setItem('math_settings', JSON.stringify(settings));
  }, [settings]);

  // Handle theme change
  useEffect(() => {
    // Sync localStorage with theme setting
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleFinishGame = useCallback((result: Result | null) => {
    if (!result) {
      setScreen(GameScreen.DASHBOARD);
      return;
    }
    setLastResult(result);

    const newProfile = { ...profile };

    if (result.mode === 'campaign' && result.correct >= 10 && gameConfig?.type === 'campaign') {
      const currentLvl = gameConfig.level; // No default needed, as it's part of the type.
      if (currentLvl > (newProfile.campaign[gameConfig.op] || 0)) {
        newProfile.campaign[gameConfig.op] = currentLvl;
      }
    } else if (result.mode === 'arcade' && gameConfig?.type === 'arcade') {
      if (result.score > (newProfile.arcade[gameConfig.arcadeMode] || 0)) {
        newProfile.arcade[gameConfig.arcadeMode] = result.score;
      }
    }

    const checkAchievement = (id: string, condition: boolean) => {
      if (!newProfile.unlockedAchievements.includes(id) && condition) {
        newProfile.unlockedAchievements.push(id);
      }
    };

    checkAchievement('first_steps', result.mode === 'campaign' && result.correct > 0);
    checkAchievement('speed_demon', result.mode === 'arcade' && gameConfig?.type === 'arcade' && gameConfig.arcadeMode === ArcadeMode.SCORE_ATTACK && result.score > 300);
    checkAchievement('survivor', result.mode === 'arcade' && gameConfig?.type === 'arcade' && gameConfig.arcadeMode === ArcadeMode.ENDLESS && result.score >= 20);
    checkAchievement('zen_master', newProfile.stats.zenLevels >= 10);
    checkAchievement('duelist', result.mode === 'arcade' && gameConfig?.type === 'arcade' && gameConfig.arcadeMode === ArcadeMode.DUEL && result.score >= 5);
    checkAchievement('sharp_eye', result.mode === 'arcade' && gameConfig?.type === 'arcade' && gameConfig.arcadeMode === ArcadeMode.FLASH && result.score >= 100);

    const totalVisualLevelsCompleted = (newProfile.campaign[CampaignOp.VISUAL_DOTS] || 0) +
                                       (newProfile.campaign[CampaignOp.VISUAL_TRIANGLES] || 0) +
                                       (newProfile.campaign[CampaignOp.VISUAL_STARS] || 0);
    checkAchievement('visual_perfectionist', totalVisualLevelsCompleted >= 10);

    Object.values(CampaignOp).forEach(op => checkAchievement(`${op}_master`, newProfile.campaign[op] >= 30));

    setProfile(newProfile);
    setScreen(GameScreen.RESULT);
  }, [profile, gameConfig, settings.timerMode]);

  const handleCharacterCreated = useCallback((name: string, avatarShape: string, avatarColor: string) => {
    setProfile(prev => ({
        ...prev,
        name,
        avatarShape,
        avatarColor,
    }));
    setScreen(GameScreen.DASHBOARD);
  }, []);

  const handleLogout = useCallback(() => {
    setProfile(prev => ({ ...prev, name: '' })); // Reset name to trigger character builder
    setScreen(GameScreen.SPLASH);
  }, []);

  const handleContinueCampaign = useCallback(() => {
    if (gameConfig?.type === 'campaign') {
      const nextLevel = gameConfig.level + 1;
      setGameConfig(prevConfig => prevConfig ? { ...prevConfig, level: nextLevel } as GameConfig : null);
      setScreen(GameScreen.GAME);
    }
  }, [gameConfig]);

  const handleOpenCalculator = useCallback(() => {
    setScreen(GameScreen.CALCULATOR);
  }, []);

  return (
    <div className="h-full w-full">
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        timerMode={settings.timerMode}
        setTimerMode={(m) => setSettings(s => ({ ...s, timerMode: m }))}
        theme={settings.theme}
        setTheme={(t) => setSettings(s => ({ ...s, theme: t }))}
        language={settings.language}
        setLanguage={(l) => setSettings(s => ({ ...s, language: l }))}
      />

      <ErrorBoundary>

      <LanguageProvider initialLanguage={settings.language}>

      <AchievementsModal
        isOpen={showAchievements}
        onClose={() => setShowAchievements(false)}
        unlocked={profile.unlockedAchievements}
        key={settings.language}
      />

      {screen === GameScreen.SPLASH && (
        <Splash 
          onEnter={async () => {
            await initAudio(); // Initialize audio on user interaction
            if (!profile.name) {
              setScreen(GameScreen.CHARACTER_BUILDER);
            } else {
              setScreen(GameScreen.DASHBOARD);
            }
          }} 
        />
      )}

      {screen === GameScreen.CHARACTER_BUILDER && (
        <CharacterBuilder onCharacterCreated={handleCharacterCreated} />
      )}

      {screen === GameScreen.DASHBOARD && (
        <Dashboard
          profile={profile}
          onSelectCampaign={(op, level, isPractice = false) => {
            setGameConfig({ type: isPractice ? 'practice' : 'campaign', op, level });
            if (isPractice) setScreen(GameScreen.GAME);
            else setScreen(GameScreen.LEVEL_MAP);
          }}
          onSelectArcade={(id) => {
            setGameConfig({ type: 'arcade', arcadeMode: id });
            setScreen(GameScreen.GAME);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenAchievements={() => setShowAchievements(true)}
          onOpenCalculator={handleOpenCalculator}
          onLogout={handleLogout}
          isDark={isDark}
          toggleTheme={() => setIsDark(d => !d)}
          currentPracticeDifficulty={settings.practiceDifficulty}
          setPracticeDifficulty={(d) => setSettings(s => ({ ...s, practiceDifficulty: d }))}
        />
      )}

      {screen === GameScreen.LEVEL_MAP && gameConfig && (
        <LevelMap
          profile={profile}
          gameConfig={gameConfig} // Ensure gameConfig is passed as is
          onSelectLevel={(level) => {
            if (gameConfig && gameConfig.type === 'campaign') {
              setGameConfig(prevConfig => prevConfig ? { ...prevConfig, level } as GameConfig : null);
              setScreen(GameScreen.GAME);
            }
          }}
          onBack={() => setScreen(GameScreen.DASHBOARD)}
        />
      )}

      {screen === GameScreen.GAME && gameConfig && (
        <GameArena mode={gameConfig.type} config={gameConfig} onFinish={handleFinishGame} playSound={playSound} settings={settings} />
      )}

      {screen === GameScreen.RESULT && lastResult && (
        <ResultModal 
          result={lastResult} 
          onRestart={() => setScreen(GameScreen.GAME)}
          onMenu={() => setScreen(GameScreen.DASHBOARD)} 
          onContinueCampaign={handleContinueCampaign}
          currentCampaignLevel={gameConfig?.type === 'campaign' ? gameConfig.level : undefined}
          settingsTimerMode={settings.timerMode} // Pass settings.timerMode
        />
      )}

      {screen === GameScreen.CALCULATOR && (
        <Calculator onBack={() => setScreen(GameScreen.DASHBOARD)} playSound={playSound} />
      )}
      </LanguageProvider>

      </ErrorBoundary>
    </div>
  );
};

export default App;
