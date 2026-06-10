function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function clearPageStorage(tabId, options) {
  const needsScript =
    options.sessionStorage || options.localStorage || options.indexedDB;
  if (!needsScript) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (opts) => {
      if (opts.sessionStorage) {
        sessionStorage.clear();
      }
      if (opts.localStorage) {
        localStorage.clear();
      }
      if (opts.indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all(
          dbs.map(
            (db) =>
              new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              })
          )
        );
      }
    },
    args: [options]
  });
}

async function clearBrowsingData(origin, options) {
  const dataTypes = {};
  if (options.cookie) {
    dataTypes.cookies = true;
  }
  if (options.fileDiskCache) {
    dataTypes.cache = true;
    dataTypes.cacheStorage = true;
    dataTypes.serviceWorkers = true;
  }
  if (Object.keys(dataTypes).length === 0) return;
  await chrome.browsingData.remove({ origins: [origin] }, dataTypes);
}

async function hardReload(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.location.reload(true);
      }
    });
  } catch {
    await chrome.tabs.reload(tabId, { bypassCache: true });
  }
}

async function clearSelected(tabId, url, options) {
  const origin = getOrigin(url);
  if (!origin) {
    throw new Error("无法解析当前页面地址");
  }

  await clearPageStorage(tabId, options);
  await clearBrowsingData(origin, options);

  if (options.fileDiskCache) {
    await hardReload(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "clearSelected") {
    return false;
  }

  clearSelected(message.tabId, message.url, message.options)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
