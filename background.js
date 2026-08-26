const TABS_KEY = 'monitoredTabs';

function entryKey(id) { return 'pageMonitor_' + id; }
function busyKey(id) { return 'cycleBusy_' + id; }

function reloadAndCheck(tabId, entry) {
  chrome.tabs.reload(tabId, {}, () => {
    if (chrome.runtime.lastError) { removeEntry(entry.id); return; }
    waitForContent(tabId, entry);
  });
}

function resolveTab(entry, callback) {
  chrome.tabs.get(entry.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) { callback(tab.id); return; }
    if (!entry.url) { callback(null); return; }
    chrome.tabs.query({}, (tabs) => {
      const found = tabs.find(t => t.url === entry.url);
      if (found) {
        updateEntryTabId(entry.id, found.id);
        callback(found.id);
      } else {
        callback(null);
      }
    });
  });
}

function removeEntry(id) {
  chrome.storage.local.get(TABS_KEY, (data) => {
    const tabs = data[TABS_KEY] || [];
    const newTabs = tabs.filter(e => e.id !== id);
    chrome.alarms.clear(entryKey(id));
    chrome.storage.local.remove(busyKey(id));
    chrome.storage.local.set({ [TABS_KEY]: newTabs });
  });
}

function updateEntryTabId(id, newTabId) {
  chrome.storage.local.get(TABS_KEY, (data) => {
    const tabs = data[TABS_KEY] || [];
    const idx = tabs.findIndex(e => e.id === id);
    if (idx === -1) return;
    tabs[idx].tabId = newTabId;
    chrome.storage.local.set({ [TABS_KEY]: tabs });
  });
}

function activateTabByUrl(url) {
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  const match = alarm.name.match(/^pageMonitor_(.+)$/);
  if (!match) return;
  const id = match[1];
  chrome.storage.local.get([TABS_KEY, 'paused', busyKey(id)], (data) => {
    if (data.paused || data[busyKey(id)]) return;
    const tabs = data[TABS_KEY] || [];
    const entry = tabs.find(e => e.id === id);
    if (!entry) return;
    chrome.storage.local.set({ [busyKey(id)]: true });
    resolveTab(entry, (tabId) => {
      if (tabId) reloadAndCheck(tabId, entry);
      else removeEntry(id);
    });
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start') {
    addEntry(msg.tabId, msg.url, msg.interval, msg.triggerText, msg.loadDelay, msg.alertDuration, msg.clickThrough, msg.clickThroughIndex, msg.switchToTab);
  } else if (msg.action === 'stop') {
    removeEntry(msg.id);
  } else if (msg.action === 'playAlert') {
    playAlertSound(msg.duration);
    chrome.storage.local.get([TABS_KEY, 'removedEntries'], (data) => {
      const tabs = data[TABS_KEY] || [];
      const removed = data.removedEntries || [];
      const entry = tabs.find(e => e.id === msg.id);
      if (entry) {
        const pos = tabs.indexOf(entry);
        const keep = { url: entry.url, interval: entry.interval, triggerText: entry.triggerText, loadDelay: entry.loadDelay, alertDuration: entry.alertDuration, clickThrough: entry.clickThrough, clickThroughIndex: entry.clickThroughIndex, switchToTab: entry.switchToTab, position: pos };
        removed.push(keep);
        chrome.storage.local.set({ removedEntries: removed });
        if (entry.switchToTab) { activateTabByUrl(entry.url); }
      }
      removeEntry(msg.id);
    });
  } else if (msg.action === 'activateTab') {
    activateTabByUrl(msg.url);
  } else if (msg.action === 'clearAll') {
    chrome.storage.local.get(TABS_KEY, (data) => {
      const tabs = data[TABS_KEY] || [];
      tabs.forEach(e => { chrome.alarms.clear(entryKey(e.id)); chrome.storage.local.remove(busyKey(e.id)); });
      chrome.storage.local.set({ [TABS_KEY]: [], removedEntries: [] });
    });
  } else if (msg.action === 'pause') {
    chrome.storage.local.get(TABS_KEY, (data) => {
      const tabs = data[TABS_KEY] || [];
      tabs.forEach(e => chrome.alarms.clear(entryKey(e.id)));
      chrome.storage.local.set({ paused: true });
    });
  } else if (msg.action === 'resume') {
    chrome.storage.local.get([TABS_KEY, 'settings'], (data) => {
      const tabs = data[TABS_KEY] || [];
      const staggerOffset = (data.settings && data.settings.staggerOffset) || 0;
      tabs.forEach((entry, i) => {
        const delay = staggerOffset ? i * staggerOffset : 0;
        scheduleAlarm(entry.id, entry.interval, delay);
      });
      chrome.storage.local.set({ paused: false });
    });
  } else if (msg.action === 'reAdd') {
    chrome.storage.local.get([TABS_KEY, 'removedEntries', 'settings'], (data) => {
      const tabs = data[TABS_KEY] || [];
      const removed = data.removedEntries || [];
      const idx = removed.findIndex(e => e.url === msg.url);
      if (idx === -1) return;
      const entry = removed[idx];
      const pos = Math.min(entry.position || tabs.length, tabs.length);
      removed.splice(idx, 1);
      const staggerOffset = (data.settings && data.settings.staggerOffset) || 0;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const newEntry = { id, tabId: null, url: entry.url, interval: entry.interval, triggerText: entry.triggerText, loadDelay: entry.loadDelay || 0, alertDuration: entry.alertDuration || 3, clickThrough: !!entry.clickThrough, clickThroughIndex: entry.clickThroughIndex || 1, switchToTab: !!entry.switchToTab };
      tabs.splice(pos, 0, newEntry);
      chrome.storage.local.set({ [TABS_KEY]: tabs, removedEntries: removed, [busyKey(id)]: true }).then(() => {
        const delay = staggerOffset ? pos * staggerOffset : 0;
        scheduleAlarm(id, entry.interval, delay);
        ensureOffscreenDocument();
        chrome.tabs.query({ url: entry.url }, (res) => {
          const tab = res[0];
          if (tab) {
            newEntry.tabId = tab.id;
            updateEntryTabId(id, tab.id);
            chrome.tabs.reload(tab.id, {}, () => {
              if (chrome.runtime.lastError) { removeEntry(id); return; }
              waitForContent(tab.id, newEntry);
            });
          }
        });
      });
    });
  } else if (msg.action === 'clearRemoved') {
    chrome.storage.local.remove('removedEntries');
  } else if (msg.action === 'reorderTabs') {
    chrome.storage.local.get([TABS_KEY, 'settings'], (data) => {
      const tabs = data[TABS_KEY] || [];
      const staggerOffset = (data.settings && data.settings.staggerOffset) || 0;
      const reordered = msg.ids.map(id => tabs.find(e => e.id === id)).filter(Boolean);
      chrome.storage.local.set({ [TABS_KEY]: reordered }).then(() => {
        if (staggerOffset) {
          reordered.forEach((entry, i) => {
            chrome.alarms.clear(entryKey(entry.id), () => {
              scheduleAlarm(entry.id, entry.interval, i * staggerOffset);
            });
          });
        }
      });
    });
  } else if (msg.action === 'resetAllIntervals') {
    resetAllIntervals(msg.staggerOffset || 0, msg.settings);
  }
});

function scheduleAlarm(id, intervalSec, delaySec) {
  chrome.alarms.create(entryKey(id), {
    delayInMinutes: delaySec / 60,
    periodInMinutes: intervalSec / 60
  });
}

function resetAllIntervals(staggerOffset, newSettings) {
  chrome.storage.local.get([TABS_KEY, 'settings'], (data) => {
    const tabs = data[TABS_KEY] || [];
    const settings = { ...(data.settings || {}), staggerOffset };
    const merged = newSettings ? { ...settings, ...newSettings } : settings;
    const updated = newSettings ? tabs.map(e => ({ ...e, ...newSettings })) : tabs;
    chrome.storage.local.set({ [TABS_KEY]: updated, settings: merged }).then(() => {
      tabs.forEach((entry, i) => {
        chrome.alarms.clear(entryKey(entry.id), () => {
          const delay = staggerOffset ? i * staggerOffset : 0;
          scheduleAlarm(updated[i].id, updated[i].interval, delay);
        });
      });
    });
  });
}

function addEntry(tabId, url, intervalSec, triggerText, loadDelay, alertDuration, clickThrough, clickThroughIndex, switchToTab) {
  chrome.storage.local.get([TABS_KEY, 'settings'], (data) => {
    const tabs = data[TABS_KEY] || [];
    const staggerOffset = (data.settings && data.settings.staggerOffset) || 0;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { id, tabId, url, interval: intervalSec, triggerText, loadDelay, alertDuration, clickThrough: !!clickThrough, clickThroughIndex: clickThroughIndex || 1, switchToTab: !!switchToTab };
    tabs.push(entry);
    chrome.storage.local.set({ [TABS_KEY]: tabs, [busyKey(id)]: true });
    const delay = staggerOffset ? (tabs.length - 1) * staggerOffset : 0;
    scheduleAlarm(id, intervalSec, delay);
    ensureOffscreenDocument();
    chrome.tabs.reload(tabId, {}, () => {
      if (chrome.runtime.lastError) { removeEntry(id); return; }
      waitForContent(tabId, entry);
    });
  });
}

function waitForContent(tabId, entry, retries = 2) {
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, {
      action: 'getContent',
      triggerText: entry.triggerText,
      loadDelay: entry.loadDelay || 0,
      alertDuration: entry.alertDuration || 3,
      entryId: entry.id,
      clickThrough: entry.clickThrough === true,
      clickThroughIndex: entry.clickThroughIndex || 1
    }, (result) => {
      if (chrome.runtime.lastError) {
        if (retries > 0) waitForContent(tabId, entry, retries - 1);
        else chrome.storage.local.remove(busyKey(entry.id));
      } else if (!result.matched) {
        if (retries > 0) waitForContent(tabId, entry, retries - 1);
        else chrome.storage.local.remove(busyKey(entry.id));
      }
    });
  }, 1500);
}

async function ensureOffscreenDocument() {
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play alert sound when target text is found'
      });
    }
  } catch (e) {
    console.error('Page Monitor: offscreen doc error', e);
  }
}

async function playAlertSound(duration) {
  try {
    await chrome.runtime.sendMessage({ action: 'playBeep', duration });
  } catch (e) {
    console.error('Page Monitor: sound error', e);
  }
}

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get([TABS_KEY, 'settings', 'paused'], (data) => {
    const tabs = data[TABS_KEY] || [];
    if (!tabs.length || data.paused) return;
    const staggerOffset = (data.settings && data.settings.staggerOffset) || 0;
    const entries = [...tabs];
    entries.forEach((entry, i) => {
      chrome.tabs.get(entry.tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          chrome.storage.local.set({ [busyKey(entry.id)]: true });
          const delay = staggerOffset ? i * staggerOffset : 0;
          scheduleAlarm(entry.id, entry.interval, delay);
          ensureOffscreenDocument();
          chrome.tabs.reload(entry.tabId, {}, () => {
            if (chrome.runtime.lastError) { removeEntry(entry.id); return; }
            waitForContent(entry.tabId, entry);
          });
        } else {
          removeEntry(entry.id);
        }
      });
    });
  });
});