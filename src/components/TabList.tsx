import { useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabSpec {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: readonly TabSpec[];
  ariaLabel: string;
  idPrefix: string;
  initialTab?: string;
}

// Horizontal tabs with a roving tabindex: Left/Right move between tabs and
// activate them, Home/End jump to the ends, and only the active panel is in the
// DOM so a hidden chart is never mounted or announced.
export function Tabs({ tabs, ariaLabel, idPrefix, initialTab }: TabsProps) {
  const [activeId, setActiveId] = useState(initialTab ?? tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? null;
  const activeIndex = active ? tabs.indexOf(active) : 0;

  const tabId = (id: string) => `${idPrefix}-tab-${id}`;
  const panelId = (id: string) => `${idPrefix}-panel-${id}`;

  const move = (delta: number) => {
    if (tabs.length === 0) return;
    const next = (activeIndex + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    setActiveId(tab.id);
    document.getElementById(tabId(tab.id))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(1);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        move(-1);
        return;
      case 'Home':
        event.preventDefault();
        setActiveId(tabs[0]!.id);
        document.getElementById(tabId(tabs[0]!.id))?.focus();
        return;
      case 'End':
        event.preventDefault();
        setActiveId(tabs[tabs.length - 1]!.id);
        document.getElementById(tabId(tabs[tabs.length - 1]!.id))?.focus();
        return;
      default:
        return;
    }
  };

  if (active === null) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surfaceAlt p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId(active.id)}
        role="tabpanel"
        aria-labelledby={tabId(active.id)}
        tabIndex={0}
        className="mt-3 animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
      >
        {active.content}
      </div>
    </div>
  );
}
