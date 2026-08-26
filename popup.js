const addBtn = document.getElementById('addBtn');
const popoutBtn = document.getElementById('popoutBtn');
const resetBtn = document.getElementById('resetBtn');
const clearListBtn = document.getElementById('clearListBtn');
const pauseBtn = document.getElementById('pauseBtn');
const intervalInput = document.getElementById('interval');
const loadDelayInput = document.getElementById('loadDelay');
const triggerTextInput = document.getElementById('triggerText');
const alertDurationInput = document.getElementById('alertDuration');
const urlDiv = document.getElementById('currentUrl');
const tabList = document.getElementById('tabList');
const emptyHint = document.getElementById('emptyHint');
const addSection = document.getElementById('addSection');
const alreadyMonitored = document.getElementById('alreadyMonitored');
const staggerToggle = document.getElementById('staggerToggle');
const staggerLabel = document.getElementById('staggerLabel');

function updateStaggerLabel(offset) {
  staggerLabel.textContent = offset > 0 ? '(' + offset + 's apart)' : '';
}
const clickThroughToggle = document.getElementById('clickThroughToggle');
const clickThroughIndex = document.getElementById('clickThroughIndex');
const switchTabToggle = document.getElementById('switchTabToggle');
const alertedSection = document.getElementById('alertedSection');
const alertedList = document.getElementById('alertedList');
const alertedEmpty = document.getElementById('alertedEmpty');
const clearAlertedBtn = document.getElementById('clearAlertedBtn');
const statusBadge = document.getElementById('statusBadge');

let currentTab = null;

async function updateUI() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  currentTab = tab;
  if (tab) urlDiv.textContent = tab.url;

  const { monitoredTabs, settings, removedEntries, paused } = await chrome.storage.local.get(['monitoredTabs', 'settings', 'removedEntries', 'paused']);
  const tabs = monitoredTabs || [];
  const removed = removedEntries || [];

  const isCurrentMonitored = tabs.some(e => e.url === tab?.url && e.tabId === tab?.id);
  addSection.style.display = (tab && !isCurrentMonitored) ? '' : 'none';
  alreadyMonitored.style.display = isCurrentMonitored ? '' : 'none';

  const hasTabs = tabs.length > 0;
  resetBtn.disabled = !hasTabs;
  pauseBtn.style.display = hasTabs ? '' : 'none';
  clearListBtn.style.display = hasTabs ? '' : 'none';
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.style.background = paused ? '#28a745' : '#ffc107';
  pauseBtn.style.color = paused ? '#fff' : '#856404';

  if (paused) {
    statusBadge.className = 'status-badge paused';
    statusBadge.textContent = 'Paused (' + tabs.length + ' page' + (tabs.length > 1 ? 's' : '') + ')';
  } else if (tabs.length) {
    statusBadge.className = 'status-badge active';
    statusBadge.textContent = 'Monitoring ' + tabs.length + ' page' + (tabs.length > 1 ? 's' : '');
  } else {
    statusBadge.className = 'status-badge inactive';
    statusBadge.textContent = 'Not monitoring';
  }

  emptyHint.style.display = tabs.length ? 'none' : '';
  tabList.querySelectorAll('.tab-item').forEach(el => el.remove());

  tabs.forEach((entry, idx) => {
    const div = document.createElement('div');
    div.className = 'tab-item';
    div.draggable = true;
    div.dataset.idx = idx;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '\u2261';

    const badge = document.createElement('span');
    badge.className = 'active-badge ' + (entry.tabId === tab?.id ? 'on' : 'off');

    const urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;
    urlSpan.onclick = () => chrome.runtime.sendMessage({ action: 'activateTab', url: entry.url });

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = 'every ' + entry.interval + 's';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = async () => {
      await chrome.runtime.sendMessage({ action: 'stop', id: entry.id });
      setTimeout(updateUI, 200);
    };

    div.append(handle, badge, urlSpan, meta, removeBtn);

    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', idx);
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    div.addEventListener('dragover', (e) => { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', async (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (fromIdx === idx) return;
      const items = [...tabs];
      const [moved] = items.splice(fromIdx, 1);
      items.splice(idx, 0, moved);
      await chrome.runtime.sendMessage({ action: 'reorderTabs', ids: items.map(i => i.id) });
      setTimeout(updateUI, 200);
    });

    tabList.appendChild(div);
  });

  alertedSection.style.display = removed.length ? '' : 'none';
  alertedEmpty.style.display = removed.length ? 'none' : '';
  alertedList.querySelectorAll('.tab-item').forEach(el => el.remove());

  removed.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'tab-item';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;
    urlSpan.onclick = () => chrome.runtime.sendMessage({ action: 'activateTab', url: entry.url });

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = 'every ' + entry.interval + 's';

    const addBackBtn = document.createElement('button');
    addBackBtn.className = 'remove-btn';
    addBackBtn.style.borderColor = '#007bff';
    addBackBtn.style.color = '#007bff';
    addBackBtn.textContent = 'Monitor again';
    addBackBtn.onclick = async () => {
      await chrome.runtime.sendMessage({ action: 'reAdd', url: entry.url });
      setTimeout(updateUI, 200);
    };

    div.append(urlSpan, meta, addBackBtn);
    alertedList.appendChild(div);
  });

  if (settings) {
    intervalInput.value = settings.interval ?? 3;
    loadDelayInput.value = settings.loadDelay ?? '';
    triggerTextInput.value = settings.triggerText ?? '';
    alertDurationInput.value = settings.alertDuration ?? 3;
    staggerToggle.checked = settings.staggerOffset > 0;
    updateStaggerLabel(settings.staggerOffset || 0);
    clickThroughToggle.checked = settings.clickThrough === true;
    clickThroughIndex.disabled = !settings.clickThrough;
    clickThroughIndex.value = settings.clickThroughIndex || 1;
    switchTabToggle.checked = settings.switchToTab === true;
  }
}

popoutBtn.addEventListener('click', () => {
  chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 440, height: 640 });
  window.close();
});

async function getSettings() {
  const interval = parseInt(intervalInput.value, 10);
  if (interval < 1) { alert('Minimum interval is 1 second'); return null; }
  const triggerText = triggerTextInput.value.trim();
  if (!triggerText) { alert('Enter text or a regex to watch for.'); return null; }
  const loadDelay = parseInt(loadDelayInput.value, 10) || 0;
  const alertDuration = parseInt(alertDurationInput.value, 10) || 3;
  const clickThrough = clickThroughToggle.checked;
  const clickThroughIndexVal = parseInt(clickThroughIndex.value, 10) || 1;
  const switchToTab = switchTabToggle.checked;
  const { settings: currentSettings } = await chrome.storage.local.get('settings');
  const settings = { interval, loadDelay, triggerText, alertDuration, clickThrough, clickThroughIndex: clickThroughIndexVal, switchToTab, staggerOffset: (currentSettings && currentSettings.staggerOffset) || 0 };
  await chrome.storage.local.set({ settings });
  return { interval, loadDelay, triggerText, alertDuration, clickThrough, clickThroughIndex: clickThroughIndexVal, switchToTab };
}

async function startMonitoring(tabId, url) {
  const s = await getSettings();
  if (!s) return;
  await chrome.runtime.sendMessage({
    action: 'start',
    tabId, url,
    interval: s.interval, loadDelay: s.loadDelay, triggerText: s.triggerText, alertDuration: s.alertDuration, clickThrough: s.clickThrough, clickThroughIndex: s.clickThroughIndex, switchToTab: s.switchToTab
  });
}

addBtn.addEventListener('click', async () => {
  if (!currentTab) return;
  await startMonitoring(currentTab.id, currentTab.url);
  setTimeout(updateUI, 200);
});

const selectTabsBtn = document.getElementById('selectTabsBtn');
const tabSelectPanel = document.getElementById('tabSelectPanel');
const tabSelectList = document.getElementById('tabSelectList');
const addSelectedBtn = document.getElementById('addSelectedBtn');
const cancelSelectBtn = document.getElementById('cancelSelectBtn');

selectTabsBtn.addEventListener('click', async () => {
  const { monitoredTabs } = await chrome.storage.local.get('monitoredTabs');
  const monitored = monitoredTabs || [];
  const all = await chrome.tabs.query({ currentWindow: true });
  const selectable = all.filter(t => /^https?:\/\//.test(t.url || ''));
  tabSelectList.innerHTML = '';
  if (!selectable.length) {
    tabSelectList.innerHTML = '<div class="empty-hint">No browsable tabs found.</div>';
  }
  selectable.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'tab-item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'tab-select-box';
    box.dataset.id = t.id;
    box.dataset.url = t.url;
    if (monitored.some(e => e.url === t.url && e.tabId === t.id)) box.checked = true;
    const urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = t.url;
    urlSpan.title = t.url;
    urlSpan.style.cursor = 'default';
    row.append(box, urlSpan);
    tabSelectList.appendChild(row);
  });
  tabSelectPanel.style.display = 'block';
});

cancelSelectBtn.addEventListener('click', () => { tabSelectPanel.style.display = 'none'; });

addSelectedBtn.addEventListener('click', async () => {
  const boxes = tabSelectList.querySelectorAll('.tab-select-box:checked');
  if (!boxes.length) { alert('Select at least one tab.'); return; }
  for (const box of boxes) {
    await startMonitoring(parseInt(box.dataset.id, 10), box.dataset.url);
  }
  tabSelectPanel.style.display = 'none';
  setTimeout(updateUI, 200);
});

resetBtn.addEventListener('click', async () => {
  const { monitoredTabs } = await chrome.storage.local.get('monitoredTabs');
  const tabs = monitoredTabs || [];
  const interval = parseInt(intervalInput.value, 10) || 3;
  const staggerVal = staggerToggle.checked ? Math.round(interval / Math.max(tabs.length, 1)) : 0;
  updateStaggerLabel(staggerVal);
  const settings = {
    interval: parseInt(intervalInput.value, 10) || 3,
    loadDelay: parseInt(loadDelayInput.value, 10) || 0,
    triggerText: triggerTextInput.value.trim(),
    alertDuration: parseInt(alertDurationInput.value, 10) || 3,
    clickThrough: clickThroughToggle.checked,
    clickThroughIndex: parseInt(clickThroughIndex.value, 10) || 1,
    switchToTab: switchTabToggle.checked
  };
  await chrome.runtime.sendMessage({ action: 'resetAllIntervals', staggerOffset: staggerVal, settings });
  setTimeout(updateUI, 200);
});

pauseBtn.addEventListener('click', async () => {
  const { paused } = await chrome.storage.local.get('paused');
  await chrome.runtime.sendMessage({ action: paused ? 'resume' : 'pause' });
  setTimeout(updateUI, 200);
});

clearListBtn.addEventListener('click', async () => {
  if (confirm('Remove all monitored pages and alerted pages?')) {
    await chrome.runtime.sendMessage({ action: 'clearAll' });
    setTimeout(updateUI, 200);
  }
});

staggerToggle.addEventListener('change', async () => {
  const { monitoredTabs, settings } = await chrome.storage.local.get(['monitoredTabs', 'settings']);
  const curr = settings || {};
  const tabs = monitoredTabs || [];
  const interval = curr.interval || parseInt(intervalInput.value, 10) || 3;
  const newOffset = staggerToggle.checked ? Math.round(interval / Math.max(tabs.length, 1)) : 0;
  updateStaggerLabel(newOffset);
  await chrome.storage.local.set({ settings: { ...curr, staggerOffset: newOffset } });
});

clickThroughToggle.addEventListener('change', () => {
  clickThroughIndex.disabled = !clickThroughToggle.checked;
});

clearAlertedBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'clearRemoved' });
  setTimeout(updateUI, 200);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitoredTabs || changes.removedEntries || changes.paused) updateUI();
});

document.addEventListener('DOMContentLoaded', updateUI);