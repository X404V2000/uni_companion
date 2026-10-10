/**
 * Peer Study Pack Sharing, QR Code Generator & Instant Syllabus Importer
 * 
 * Provides:
 * 1. Multi-channel Study Pack sharing (WhatsApp, Live QR Code for campus peers, Deep link)
 * 2. Assignment Brief roadmap sharing
 * 3. Incoming share receiver & 1-tap peer syllabus importer
 */

export function renderShareViewsHtml(): string {
  return `
  <!-- ======================================================== -->
  <!-- 1. SHARE STUDY PACK MODAL (WhatsApp, QR Code, Deep Link)  -->
  <!-- ======================================================== -->
  <div id="shareModalOverlay" class="fixed inset-0 z-50 bg-black/70 hidden flex items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-[#15171d] border border-[#262932] rounded-[12px] w-full max-w-md p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-[8px] bg-[#25d366]/15 border border-[#25d366]/30 flex items-center justify-center text-[#25d366]">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.36 7.34 9.09 7.4 8.87 7.65C8.65 7.89 8.02 8.48 8.02 9.69C8.02 10.9 8.9 12.06 9.02 12.22C9.14 12.38 10.74 14.85 13.2 15.91C13.78 16.16 14.24 16.32 14.59 16.43C15.18 16.62 15.72 16.59 16.14 16.53C16.62 16.46 17.59 15.94 17.79 15.37C18 14.81 18 14.33 17.93 14.22C17.87 14.12 17.71 14.06 17.47 13.94C17.23 13.82 16.03 13.23 15.81 13.15C15.58 13.07 15.42 13.03 15.26 13.27C15.09 13.51 14.62 14.06 14.48 14.22C14.34 14.38 14.2 14.4 13.96 14.28C13.72 14.16 12.95 13.91 12.04 13.1C11.33 12.47 10.85 11.69 10.71 11.45C10.57 11.21 10.7 11.08 10.82 10.96C10.93 10.85 11.07 10.67 11.19 10.53C11.31 10.39 11.35 10.29 11.43 10.13C11.51 9.97 11.47 9.83 11.41 9.71C11.35 9.59 10.88 8.43 10.68 7.96C10.49 7.5 10.29 7.56 10.14 7.56C10 7.56 9.84 7.34 9.53 7.34Z"/>
            </svg>
          </div>
          <div>
            <h2 class="text-[15px] font-semibold text-[#f3f4f6]">Share study pack &amp; deadlines</h2>
            <p class="text-[11px] text-[#9ca3af]">Export syllabus items for classmates and study groups</p>
          </div>
        </div>
        <button onclick="closeShareModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[20px] leading-none px-1">&times;</button>
      </div>

      <!-- Pack Target Info Banner -->
      <div class="p-3 rounded-[8px] bg-[#0f1115] border border-[#262932] flex items-center justify-between">
        <div class="min-w-0 pr-2">
          <div class="flex items-center gap-2">
            <span id="sharePackBadge" class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#1b1e25] text-[#f3f4f6] border border-[#262932]">COS 212</span>
            <div id="sharePackTargetTitle" class="font-medium text-[#f3f4f6] text-[13px] truncate">Data Structures</div>
          </div>
          <p id="sharePackTargetSubtitle" class="text-[11px] text-[#6b7280] mt-0.5">Includes deliverables, materials, and notes</p>
        </div>
        <span id="sharePackTypeBadge" class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#3b5b8c]/20 text-[#60a5fa] border border-[#3b5b8c]/40 shrink-0">MODULE</span>
      </div>

      <!-- Share Channel Switcher Tabs -->
      <div class="flex border-b border-[#262932] text-[12px] gap-2">
        <button onclick="setShareChannel('whatsapp')" id="shareTab-whatsapp"
          class="flex-1 py-2 font-medium text-center border-b-2 border-[#25d366] text-[#25d366] state-transition flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.36 7.34 9.09 7.4 8.87 7.65C8.65 7.89 8.02 8.48 8.02 9.69C8.02 10.9 8.9 12.06 9.02 12.22C9.14 12.38 10.74 14.85 13.2 15.91C13.78 16.16 14.24 16.32 14.59 16.43C15.18 16.62 15.72 16.59 16.14 16.53C16.62 16.46 17.59 15.94 17.79 15.37C18 14.81 18 14.33 17.93 14.22C17.87 14.12 17.71 14.06 17.47 13.94C17.23 13.82 16.03 13.23 15.81 13.15C15.58 13.07 15.42 13.03 15.26 13.27C15.09 13.51 14.62 14.06 14.48 14.22C14.34 14.38 14.2 14.4 13.96 14.28C13.72 14.16 12.95 13.91 12.04 13.1C11.33 12.47 10.85 11.69 10.71 11.45C10.57 11.21 10.7 11.08 10.82 10.96C10.93 10.85 11.07 10.67 11.19 10.53C11.31 10.39 11.35 10.29 11.43 10.13C11.51 9.97 11.47 9.83 11.41 9.71C11.35 9.59 10.88 8.43 10.68 7.96C10.49 7.5 10.29 7.56 10.14 7.56C10 7.56 9.84 7.34 9.53 7.34Z"/>
          </svg>
          <span>WhatsApp</span>
        </button>
        <button onclick="setShareChannel('qr')" id="shareTab-qr"
          class="flex-1 py-2 font-medium text-center border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] state-transition flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
          </svg>
          <span>Scan QR</span>
        </button>
        <button onclick="setShareChannel('link')" id="shareTab-link"
          class="flex-1 py-2 font-medium text-center border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] state-transition flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
          <span>Direct Link</span>
        </button>
      </div>

      <!-- TAB 1: WHATSAPP SHARING -->
      <div id="shareChannelContent-whatsapp" class="space-y-3">
        <p class="text-[12px] text-[#9ca3af]">
          Sends an invite to your varsity WhatsApp group with formatted module deadlines and a direct deep link for 1-tap peer import.
        </p>

        <a id="sharePackWhatsAppBtn" href="#" target="_blank" rel="noopener noreferrer"
          class="w-full bg-[#25d366] hover:bg-[#20ba59] active:bg-[#1da850] text-[#0b1410] font-semibold py-2.5 px-3 rounded-[8px] text-[13px] state-transition flex items-center justify-center gap-2 shadow-sm">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.36 7.34 9.09 7.4 8.87 7.65C8.65 7.89 8.02 8.48 8.02 9.69C8.02 10.9 8.9 12.06 9.02 12.22C9.14 12.38 10.74 14.85 13.2 15.91C13.78 16.16 14.24 16.32 14.59 16.43C15.18 16.62 15.72 16.59 16.14 16.53C16.62 16.46 17.59 15.94 17.79 15.37C18 14.81 18 14.33 17.93 14.22C17.87 14.12 17.71 14.06 17.47 13.94C17.23 13.82 16.03 13.23 15.81 13.15C15.58 13.07 15.42 13.03 15.26 13.27C15.09 13.51 14.62 14.06 14.48 14.22C14.34 14.38 14.2 14.4 13.96 14.28C13.72 14.16 12.95 13.91 12.04 13.1C11.33 12.47 10.85 11.69 10.71 11.45C10.57 11.21 10.7 11.08 10.82 10.96C10.93 10.85 11.07 10.67 11.19 10.53C11.31 10.39 11.35 10.29 11.43 10.13C11.51 9.97 11.47 9.83 11.41 9.71C11.35 9.59 10.88 8.43 10.68 7.96C10.49 7.5 10.29 7.56 10.14 7.56C10 7.56 9.84 7.34 9.53 7.34Z"/>
          </svg>
          <span>Share to WhatsApp Group</span>
        </a>
      </div>

      <!-- TAB 2: LIVE QR CODE FOR CAMPUS PEERS -->
      <div id="shareChannelContent-qr" class="hidden space-y-3">
        <p class="text-[12px] text-[#9ca3af] text-center">
          Have a peer scan this directly with their phone camera in lecture or tutorial to import your study pack instantly.
        </p>

        <div class="flex justify-center p-3 bg-white rounded-[10px] w-fit mx-auto shadow-inner border border-[#d1d5db]">
          <img id="sharePackQrImg" src="" alt="Study Pack QR Code" class="w-48 h-48 block" />
        </div>

        <div class="text-center">
          <span class="text-[11px] text-[#6b7280]">Expires in 30 days · No login required to preview</span>
        </div>
      </div>

      <!-- TAB 3: DIRECT LINK & CODE -->
      <div id="shareChannelContent-link" class="hidden space-y-3">
        <div class="space-y-1.5">
          <label class="block text-[11px] font-medium text-[#9ca3af]">Universal Share URL</label>
          <div class="flex items-center gap-2">
            <input type="text" id="sharePackUrlInput" readonly
              class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[#d1d5db] font-mono outline-none select-all">
            <button onclick="copySharePackUrl()" id="copyShareUrlBtn"
              class="shrink-0 bg-[#1b1e25] hover:bg-[#232731] text-[#f3f4f6] border border-[#262932] px-3 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
              Copy
            </button>
          </div>
        </div>

        <div class="p-2.5 rounded-[6px] bg-[#0f1115] border border-[#262932] flex items-center justify-between text-[12px]">
          <span class="text-[#9ca3af]">Short share code:</span>
          <span id="sharePackShortCode" class="font-mono text-[#f3f4f6] font-semibold bg-[#15171d] px-2 py-0.5 rounded border border-[#262932]">--</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="pt-2 border-t border-[#262932] flex items-center justify-end">
        <button type="button" onclick="closeShareModal()" class="px-3.5 py-1.5 rounded-[6px] text-[13px] text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#1b1e25] state-transition">
          Done
        </button>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- 2. INCOMING PEER STUDY PACK IMPORT OVERLAY (Feature)      -->
  <!-- ======================================================== -->
  <div id="peerImportModalOverlay" class="fixed inset-0 z-50 bg-black/75 hidden flex items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-[#15171d] border border-[#262932] rounded-[12px] w-full max-w-lg p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-[8px] bg-[#3b5b8c]/20 border border-[#3b5b8c]/40 flex items-center justify-center text-[#60a5fa]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
          </div>
          <div>
            <h2 class="text-[16px] font-semibold text-[#f3f4f6]">Import Peer Study Pack</h2>
            <p id="importSharedByName" class="text-[11px] text-[#9ca3af]">Shared by classmate</p>
          </div>
        </div>
        <button onclick="closePeerImportModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[20px] leading-none">&times;</button>
      </div>

      <!-- Preview Summary Banner -->
      <div class="p-3.5 rounded-[8px] bg-[#0f1115] border border-[#262932] space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span id="importModuleCodeBadge" class="text-[12px] font-mono px-2 py-0.5 rounded bg-[#1b1e25] text-[#f3f4f6] border border-[#262932]">COS 212</span>
            <span id="importModuleTitleText" class="font-medium text-[#f3f4f6] text-[14px]">Data Structures</span>
          </div>
          <span id="importItemsCountBadge" class="text-[11px] font-mono text-[#3e885b] bg-[#3e885b]/10 border border-[#3e885b]/30 px-2 py-0.5 rounded">
            5 deliverables
          </span>
        </div>
        <p id="importSubtitleText" class="text-[12px] text-[#9ca3af]">
          Active semester deadlines, assignment weightings, and recommended study breakdown.
        </p>
      </div>

      <!-- Included Deliverables Preview List -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-[11px] font-medium text-[#9ca3af]">
          <span>Deliverables to be added to your schedule:</span>
          <span>Syllabus Weight</span>
        </div>
        <div id="importDeliverablesList" class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-3 border-t border-[#262932] flex items-center justify-between gap-3">
        <button type="button" onclick="closePeerImportModal()"
          class="px-3.5 py-2 rounded-[6px] text-[13px] text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#1b1e25] state-transition">
          Dismiss
        </button>
        <button type="button" id="btnConfirmPeerImport" onclick="handleExecutePeerImport()"
          class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-4 py-2 rounded-[6px] text-[13px] font-medium state-transition flex items-center gap-2 shadow-sm">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          <span>Import to My Semester</span>
        </button>
      </div>

    </div>
  </div>

  <!-- ======================================================== -->
  <!-- 3. MANUAL ENTER SHARE CODE MODAL                         -->
  <!-- ======================================================== -->
  <div id="enterShareCodeModalOverlay" class="fixed inset-0 z-50 bg-black/60 hidden flex items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-[#15171d] border border-[#262932] rounded-[10px] w-full max-w-sm p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Enter Share Code or URL</h3>
        <button onclick="closeEnterShareCodeModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[18px]">&times;</button>
      </div>
      <p class="text-[12px] text-[#9ca3af]">
        Paste the link or short code sent by your classmate to preview and import their syllabus pack.
      </p>
      <form onsubmit="handleManualShareCodeSubmit(event)" class="space-y-3">
        <input type="text" id="manualShareCodeInput" required placeholder="e.g. w7a-x9p... or full link"
          class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] font-mono focus:outline-none focus:border-[#3b5b8c]">
        <div class="flex items-center justify-end gap-2 pt-1">
          <button type="button" onclick="closeEnterShareCodeModal()" class="px-3 py-1.5 rounded-[6px] text-[13px] text-[#9ca3af] hover:text-[#d1d5db]">
            Cancel
          </button>
          <button type="submit" class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-3.5 py-1.5 rounded-[6px] text-[13px] font-medium state-transition">
            Preview Pack
          </button>
        </div>
      </form>
    </div>
  </div>
  `;
}

export function getShareClientScript(): string {
  return `
    let activeShareData = null;
    let pendingImportToken = null;

    // Open share modal for an entire Module
    async function openShareModule(moduleId) {
      if (!moduleId) {
        showToast('Please select a module to share.', 'error');
        return;
      }
      try {
        const res = await apiFetch('/api/v1/share/module/' + moduleId, { method: 'POST' });
        if (!res.ok) {
          throw new Error('Server returned ' + res.status);
        }
        const data = await res.json();
        activeShareData = data;
        populateShareModal(data, 'MODULE');
        document.getElementById('shareModalOverlay').classList.remove('hidden');
      } catch (err) {
        console.error('Failed to generate module share link:', err);
        showToast('Could not generate share link.', 'error');
      }
    }

    // Convenience function for current module
    function openShareCurrentModule() {
      if (typeof activeModuleId !== 'undefined' && activeModuleId) {
        openShareModule(activeModuleId);
      } else {
        showToast('No module currently active.', 'error');
      }
    }

    // Open share modal for an Assignment Brief
    async function openShareBrief(briefId) {
      if (!briefId) {
        showToast('Please select a brief to share.', 'error');
        return;
      }
      try {
        const res = await apiFetch('/api/v1/share/brief/' + briefId, { method: 'POST' });
        if (!res.ok) {
          throw new Error('Server returned ' + res.status);
        }
        const data = await res.json();
        activeShareData = data;
        populateShareModal(data, 'BRIEF');
        document.getElementById('shareModalOverlay').classList.remove('hidden');
      } catch (err) {
        console.error('Failed to generate brief share link:', err);
        showToast('Could not generate brief share link.', 'error');
      }
    }

    // Populate share modal fields
    function populateShareModal(data, type) {
      const titleEl = document.getElementById('sharePackTargetTitle');
      const subtitleEl = document.getElementById('sharePackTargetSubtitle');
      const badgeEl = document.getElementById('sharePackBadge');
      const typeBadgeEl = document.getElementById('sharePackTypeBadge');
      const urlInput = document.getElementById('sharePackUrlInput');
      const waBtn = document.getElementById('sharePackWhatsAppBtn');
      const qrImg = document.getElementById('sharePackQrImg');
      const shortCodeEl = document.getElementById('sharePackShortCode');

      if (titleEl) titleEl.textContent = data.title || 'Study Pack';
      if (badgeEl) badgeEl.textContent = data.module_code || 'ACAD';
      if (typeBadgeEl) typeBadgeEl.textContent = type;
      if (subtitleEl) {
        if (type === 'BRIEF') {
          subtitleEl.textContent = (data.milestone_count || 0) + ' milestone steps & deliverables';
        } else {
          subtitleEl.textContent = (data.task_count || 0) + ' active syllabus deadlines included';
        }
      }
      if (urlInput) urlInput.value = data.share_url;
      if (waBtn) waBtn.href = data.whatsapp_url;
      if (qrImg) qrImg.src = data.qr_data_url || ('/api/v1/share/' + data.share_id + '/qr');
      if (shortCodeEl) shortCodeEl.textContent = data.share_id;

      setShareChannel('whatsapp');
    }

    // Channel Switcher (whatsapp | qr | link)
    function setShareChannel(channel) {
      ['whatsapp', 'qr', 'link'].forEach(c => {
        const tab = document.getElementById('shareTab-' + c);
        const content = document.getElementById('shareChannelContent-' + c);
        if (tab && content) {
          if (c === channel) {
            tab.className = 'flex-1 py-2 font-medium text-center border-b-2 border-[#25d366] text-[#25d366] state-transition flex items-center justify-center gap-1.5';
            content.classList.remove('hidden');
          } else {
            tab.className = 'flex-1 py-2 font-medium text-center border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] state-transition flex items-center justify-center gap-1.5';
            content.classList.add('hidden');
          }
        }
      });
    }

    function closeShareModal() {
      const overlay = document.getElementById('shareModalOverlay');
      if (overlay) overlay.classList.add('hidden');
    }

    async function copySharePackUrl() {
      const urlInput = document.getElementById('sharePackUrlInput');
      if (!urlInput || !urlInput.value) return;

      try {
        await navigator.clipboard.writeText(urlInput.value);
        showToast('Link copied to clipboard!', 'success');
        const btn = document.getElementById('copyShareUrlBtn');
        if (btn) {
          const original = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = original; }, 2000);
        }
      } catch (err) {
        urlInput.select();
        document.execCommand('copy');
        showToast('Link copied!', 'success');
      }
    }

    // ========================================================
    // PEER STUDY PACK IMPORT HANDLERS
    // ========================================================

    async function checkIncomingShareParameter() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const shareToken = urlParams.get('share');
        if (shareToken) {
          await triggerPeerPackPreview(shareToken.trim());
        }
      } catch (e) {
        console.warn('Error reading share URL param:', e);
      }
    }

    async function triggerPeerPackPreview(token) {
      if (!token) return;
      try {
        const res = await apiFetch('/api/v1/share/' + token);
        if (!res.ok) {
          showToast('Shared study pack not found or has expired.', 'error');
          return;
        }
        const pack = await res.json();
        pendingImportToken = token;
        renderPeerPackPreviewModal(pack);
      } catch (err) {
        console.error('Failed to preview share pack:', err);
        showToast('Could not load shared study pack.', 'error');
      }
    }

    function renderPeerPackPreviewModal(pack) {
      const byName = document.getElementById('importSharedByName');
      const modCode = document.getElementById('importModuleCodeBadge');
      const modTitle = document.getElementById('importModuleTitleText');
      const subtitle = document.getElementById('importSubtitleText');
      const itemsBadge = document.getElementById('importItemsCountBadge');
      const listContainer = document.getElementById('importDeliverablesList');

      if (byName) byName.textContent = 'Shared by ' + (pack.created_by_name || 'Varsity Classmate');
      if (modCode) modCode.textContent = pack.module_code || 'ACAD';
      if (modTitle) modTitle.textContent = pack.title || pack.payload?.name || 'Study Pack';
      if (subtitle) subtitle.textContent = pack.subtitle || 'Active syllabus deadlines & study materials';

      let items = [];
      if (pack.type === 'module' && Array.isArray(pack.payload?.tasks)) {
        items = pack.payload.tasks;
        if (itemsBadge) itemsBadge.textContent = items.length + ' tasks & deadlines';
      } else if (pack.type === 'brief' && Array.isArray(pack.payload?.study_plan)) {
        items = pack.payload.study_plan.map(s => ({
          title: '[' + (s.day_number || 'Step') + '] ' + (s.focus_area || s.task || 'Milestone'),
          task_type: 'ASSIGNMENT',
          weight_percentage: 10,
          due_date: pack.payload?.due_date
        }));
        if (itemsBadge) itemsBadge.textContent = items.length + ' milestones';
      }

      if (listContainer) {
        if (items.length === 0) {
          listContainer.innerHTML = '<div class="text-[12px] text-[#6b7280] p-2 text-center">No tasks listed in this pack.</div>';
        } else {
          listContainer.innerHTML = items.map(t => {
            const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Semester';
            return \`
              <div class="p-2 rounded-[6px] bg-[#0f1115] border border-[#262932] flex items-center justify-between text-[12px]">
                <div class="min-w-0 pr-2">
                  <div class="font-medium text-[#f3f4f6] truncate">\${escapeHtml(t.title)}</div>
                  <div class="text-[11px] text-[#6b7280] mt-0.5">Due: \${dueStr} · \${escapeHtml(t.task_type || 'Assignment')}</div>
                </div>
                <span class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#1b1e25] text-[#9ca3af] border border-[#262932] shrink-0">
                  \${t.weight_percentage || 0}%
                </span>
              </div>
            \`;
          }).join('');
        }
      }

      const overlay = document.getElementById('peerImportModalOverlay');
      if (overlay) overlay.classList.remove('hidden');
    }

    function closePeerImportModal() {
      const overlay = document.getElementById('peerImportModalOverlay');
      if (overlay) overlay.classList.add('hidden');
      pendingImportToken = null;
      // Clean query parameter from URL without page reload
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('share')) {
          url.searchParams.delete('share');
          window.history.replaceState({}, document.title, url.pathname + url.search);
        }
      } catch (e) {}
    }

    async function handleExecutePeerImport() {
      if (!pendingImportToken) return;
      const btn = document.getElementById('btnConfirmPeerImport');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Importing...';
      }

      try {
        const res = await apiFetch('/api/v1/share/' + pendingImportToken + '/import', {
          method: 'POST'
        });
        if (!res.ok) {
          throw new Error('Server returned ' + res.status);
        }
        const result = await res.json();
        showToast(result.message || 'Study pack imported successfully!', 'success');
        closePeerImportModal();

        // Refresh global state
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPerformanceData === 'function') loadPerformanceData(false);

        // Auto-navigate to the imported module
        if (result.module_id && typeof navigateTo === 'function') {
          setTimeout(() => {
            navigateTo('module', result.module_id);
          }, 300);
        }
      } catch (err) {
        console.error('Failed to import study pack:', err);
        showToast('Failed to import study pack into your semester.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg><span>Import to My Semester</span>';
        }
      }
    }

    // Manual Enter Share Code Dialog
    function openManualImportModal() {
      const overlay = document.getElementById('enterShareCodeModalOverlay');
      if (overlay) overlay.classList.remove('hidden');
      const input = document.getElementById('manualShareCodeInput');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
      }
    }

    function closeEnterShareCodeModal() {
      const overlay = document.getElementById('enterShareCodeModalOverlay');
      if (overlay) overlay.classList.add('hidden');
    }

    function handleManualShareCodeSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('manualShareCodeInput');
      if (!input) return;
      let val = input.value.trim();
      if (!val) return;

      // Extract token if user pasted full URL
      if (val.includes('share=')) {
        try {
          const u = new URL(val);
          val = u.searchParams.get('share') || val;
        } catch (_) {
          const match = val.match(/share=([^&]+)/);
          if (match) val = match[1];
        }
      }

      closeEnterShareCodeModal();
      triggerPeerPackPreview(val);
    }
  `;
}
