import { useState } from 'react';

import { FactRow, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Switch } from '../components/ui/switch.js';
import { applyDarkTheme, parseStoredDarkTheme, THEME_STORAGE_KEY } from '../lib/theme.js';

export function SettingsPage() {
  const [dark, setDark] = useState(() =>
    parseStoredDarkTheme(window.localStorage.getItem(THEME_STORAGE_KEY)),
  );

  return (
    <PageShell
      title="Preferences"
      description="How gabot looks and behaves for you. These apply to this browser."
    >
      <PageSection title="General">
        <PageRows>
          <FactRow
            title="Dark theme"
            description="Use the dark appearance across gabot."
            action={
              <Switch
                aria-label="Dark theme"
                checked={dark}
                onCheckedChange={(next) => {
                  setDark(next);
                  applyDarkTheme(next);
                }}
              />
            }
          />
        </PageRows>
      </PageSection>
    </PageShell>
  );
}
