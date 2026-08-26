let responded = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getContent' && !responded) {
    responded = true;
    setTimeout(() => {
      try {
        if (!document.body) { sendResponse({ matched: false }); return; }
        const text = document.body.innerText.trim();
        const regex = new RegExp(msg.triggerText, 'i');
        const match = text.match(regex);
        if (match) {
          const matchedText = match[0].trim();
          if (msg.clickThrough) clickMatchingElement(regex, msg.clickThroughIndex || 1);
          showBanner(`Match found: "${matchedText}"`);
          chrome.runtime.sendMessage({ action: 'playAlert', duration: msg.alertDuration || 3, id: msg.entryId });
          playAlertSound(msg.alertDuration || 3);
        }
        sendResponse({ matched: !!match });
      } catch (e) {
        console.error('Page Monitor:', e);
        sendResponse({ matched: false });
      }
    }, msg.loadDelay * 1000);
    return true;
  }
});

function showBanner(message) {
  const existing = document.getElementById('__pm_banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = '__pm_banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: #fff3cd; color: #856404; padding: 14px 20px;
    font: 15px/1.4 system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2px solid #ffc107;
  `;
  banner.innerHTML = `<span><b>Page Monitor:</b> ${message}</span>` +
    `<button id="__pm_close" style="` +
    `background:none;border:1px solid #856404;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:14px;color:#856404;">Dismiss</button>`;

  document.body.prepend(banner);
  document.getElementById('__pm_close').onclick = () => banner.remove();
}

function playAlertSound(duration) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    let t = 0;
    while (t < duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.15, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
      osc.start(now + t);
      osc.stop(now + t + 0.12);
      t += 0.25;
    }
  } catch (e) {
    console.error('Page Monitor: sound error', e);
  }
}

function clickMatchingElement(regex, matchIndex) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let count = 0;
  while (walker.nextNode()) {
    if (!regex.test(walker.currentNode.textContent)) continue;
    let el = walker.currentNode.parentElement;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href) {
        count++;
        if (count === matchIndex) { window.open(el.href, '_blank'); return; }
        break;
      }
      const link = el.parentElement?.querySelector(':scope > a');
      if (link && link.href) {
        count++;
        if (count === matchIndex) { window.open(link.href, '_blank'); return; }
        break;
      }
      el = el.parentElement;
    }
  }
}
