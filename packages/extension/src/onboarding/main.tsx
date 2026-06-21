import { render } from 'preact';
import { useState } from 'preact/hooks';
import '@/styles/global.css';
import { t } from '@/i18n';
import { Storage } from '@/storage';
import { requestPersistentStorage } from '@/storage/quota';

function Onboarding() {
  const [screen, setScreen] = useState(0);

  const grantPermissions = async () => {
    await chrome.permissions
      ?.request({ permissions: ['clipboardRead', 'cookies'] })
      .catch(() => false);
    // Ask the browser not to evict our data under pressure (PLAN §41).
    await requestPersistentStorage();
    setScreen(2);
  };

  const finish = async () => {
    await Storage.settings.update({ onboardingComplete: true });
    window.close();
  };

  return (
    <div class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-8 text-center text-gray-900 dark:text-gray-100">
      {screen === 0 && (
        <>
          <h1 class="text-3xl font-bold">🧠 {t('app_name')}</h1>
          <p class="text-gray-600 dark:text-gray-300">{t('onboarding_welcome')}</p>
          <button
            type="button"
            onClick={() => setScreen(1)}
            class="mx-auto rounded bg-blue-500 px-6 py-2 font-medium text-white"
          >
            {t('get_started')} →
          </button>
        </>
      )}
      {screen === 1 && (
        <>
          <h2 class="text-2xl font-bold">Permissions</h2>
          <p class="text-gray-600 dark:text-gray-300">
            BrowseCortex needs two optional permissions: clipboard access and cookie access. All
            other permissions were granted at install. Your data never leaves your browser.
          </p>
          <button
            type="button"
            onClick={grantPermissions}
            class="mx-auto rounded bg-blue-500 px-6 py-2 font-medium text-white"
          >
            Grant Permissions
          </button>
        </>
      )}
      {screen === 2 && (
        <>
          <h2 class="text-2xl font-bold">Almost done</h2>
          <p class="text-gray-600 dark:text-gray-300">
            Add your first AI provider in Settings, then open the side panel and start chatting.
          </p>
          <div class="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage()}
              class="rounded border border-gray-300 px-6 py-2 font-medium dark:border-gray-600"
            >
              Open Settings
            </button>
            <button
              type="button"
              onClick={finish}
              class="rounded bg-blue-500 px-6 py-2 font-medium text-white"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}

render(<Onboarding />, document.getElementById('app')!);
