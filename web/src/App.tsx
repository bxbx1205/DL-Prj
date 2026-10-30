import { useEffect, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from './lib/config';
import { Translate } from './views/Translate';
import { Practice } from './views/Practice';
import { Photo } from './views/Photo';
import { ModelInfo } from './views/ModelInfo';

const ROUTES = [
  { id: 'translate', label: 'Translate' },
  { id: 'practice', label: 'Practice' },
  { id: 'photo', label: 'Photo' },
  { id: 'model', label: 'Model' },
] as const;
type Route = (typeof ROUTES)[number]['id'];

function currentRoute(): Route {
  const id = location.hash.replace('#/', '').replace('#', '');
  return ROUTES.some((r) => r.id === id) ? (id as Route) : 'translate';
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => saveSettings(settings), [settings]);

  return (
    <div className="shell">
      <header className="masthead">
        <a className="wordmark" href="#/translate">
          <span className="wordmark-mark" aria-hidden />
          Fingerspell
        </a>
        <nav className="tabs" aria-label="Sections">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <p className="masthead-note">Runs on this device. Video is never uploaded.</p>
      </header>
      <main>
        {route === 'translate' && <Translate settings={settings} onSettings={setSettings} />}
        {route === 'practice' && <Practice settings={settings} />}
        {route === 'photo' && <Photo />}
        {route === 'model' && <ModelInfo />}
      </main>
      <footer className="colophon">
        <span>ASL alphabet, 24 static letters. J and Z involve motion and are not recognised.</span>
        <span>MobileNetV3Small · MediaPipe Hands · ONNX Runtime Web</span>
      </footer>
    </div>
  );
}
