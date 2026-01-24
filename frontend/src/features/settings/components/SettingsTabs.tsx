import { Settings, Users } from 'lucide-react';

type TabType = 'general' | 'team';

interface SettingsTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="settings-tabs">
      <button
        className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
        onClick={() => onTabChange('general')}
      >
        <Settings size={16} />
        General
      </button>
      <button
        className={`settings-tab ${activeTab === 'team' ? 'active' : ''}`}
        onClick={() => onTabChange('team')}
      >
        <Users size={16} />
        Team
      </button>
    </div>
  );
}
