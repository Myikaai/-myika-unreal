/*
 * Myika Unreal — Reference App
 *
 * This is a reference implementation demonstrating the elevated design
 * system. Focus is on extractable CSS values and motion patterns, not
 * production architecture.
 *
 * Use the switcher to view different states and observe the motion.
 */

import { useState } from 'react';
import './tokens.css';
import './App.css';
import { LayoutE } from './LayoutE';
import { PermissionModal } from './PermissionModal';

type AppState = 'mid-conversation' | 'running' | 'streaming' | 'permission-modal';

function App() {
  const [state, setState] = useState<AppState>('mid-conversation');

  return (
    <div className="app">
      {/* State switcher */}
      <div className="switcher">
        <div className="switcher__label">Reference States</div>
        <div className="switcher__buttons">
          <button
            className={`switcher__button ${state === 'mid-conversation' ? 'switcher__button--active' : ''}`}
            onClick={() => setState('mid-conversation')}
          >
            Mid-conversation
          </button>
          <button
            className={`switcher__button ${state === 'running' ? 'switcher__button--active' : ''}`}
            onClick={() => setState('running')}
          >
            Tool Running
          </button>
          <button
            className={`switcher__button ${state === 'streaming' ? 'switcher__button--active' : ''}`}
            onClick={() => setState('streaming')}
          >
            Streaming
          </button>
          <button
            className={`switcher__button ${state === 'permission-modal' ? 'switcher__button--active' : ''}`}
            onClick={() => setState('permission-modal')}
          >
            Permission Modal
          </button>
        </div>
        <div className="switcher__note">
          Focus on: bridge pulse rate, tool chip scanline, streaming word fade, button glow
        </div>
      </div>

      {/* Main content */}
      <div className="content">
        {state === 'permission-modal' ? (
          <>
            <LayoutE state="mid-conversation" />
            <PermissionModal
              isOpen={true}
              onClose={() => setState('mid-conversation')}
            />
          </>
        ) : (
          <LayoutE
            state={state === 'running' ? 'running' : state === 'streaming' ? 'streaming' : 'mid-conversation'}
          />
        )}
      </div>
    </div>
  );
}

export default App;
