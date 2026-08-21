import { Settings, Users, BookOpen } from 'lucide-react';

type TabType = 'general' | 'team' | 'playbook';

const TABS = [
  { id: 'general' as const, label: 'General', Icon: Settings },
  { id: 'team' as const, label: 'Team', Icon: Users },
  { id: 'playbook' as const, label: 'Playbook', Icon: BookOpen },
];

interface SettingsTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Project admin sections">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={activeTab === id}
          className={`settings-tab ${activeTab === id ? 'active' : ''}`}
          onClick={() => onTabChange(id)}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}
