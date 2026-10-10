export function renderChatViewHtml(): string {
  return `
    <div id="view-chat" class="view-panel hidden space-y-4">
      <!-- Header bar with Title, Role selector, and Model tier -->
      <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3b5b8c] shrink-0"></span>
            <h1 class="text-[18px] font-semibold text-[#f3f4f6] tracking-tight">Gemini Campus AI Tutor</h1>
          </div>
          <p class="text-[13px] text-[#9ca3af] mt-0.5">Interactive multi-turn academic reasoning and exam mentor</p>
        </div>

        <!-- Controls: Role Selector & Model Tier -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Role Selector -->
          <div class="flex items-center gap-1.5 bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px]">
            <span class="text-[#6b7280]">Role:</span>
            <select id="chatRoleSelect" onchange="handleChatRoleChange()" class="bg-transparent text-[#f3f4f6] font-medium focus:outline-none cursor-pointer">
              <option value="tutor" class="bg-[#15171d] text-[#f3f4f6]">Academic Tutor</option>
              <option value="exam_prep" class="bg-[#15171d] text-[#f3f4f6]">Exam Prep Specialist</option>
              <option value="coder" class="bg-[#15171d] text-[#f3f4f6]">Code & Math Mentor</option>
              <option value="fast_quizzer" class="bg-[#15171d] text-[#f3f4f6]">Speed Quizzer</option>
            </select>
          </div>

          <!-- Model Tier Selector -->
          <div class="flex items-center gap-1.5 bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px]">
            <span class="text-[#6b7280]">Model:</span>
            <select id="chatModelTierSelect" onchange="handleChatModelChange()" class="bg-transparent text-[#f3f4f6] font-medium focus:outline-none cursor-pointer">
              <option value="general" class="bg-[#15171d] text-[#f3f4f6]">gemini-3.5-flash (General)</option>
              <option value="complex" class="bg-[#15171d] text-[#f3f4f6]">gemini-3.1-pro-preview (Complex)</option>
              <option value="fast" class="bg-[#15171d] text-[#f3f4f6]">gemini-3.1-flash-lite (Fast)</option>
            </select>
          </div>

          <!-- Course Context -->
          <div class="flex items-center gap-1.5 bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px]">
            <span class="text-[#6b7280]">Course:</span>
            <select id="chatCourseSelect" class="bg-transparent text-[#f3f4f6] font-medium focus:outline-none cursor-pointer">
              <option value="" class="bg-[#15171d] text-[#f3f4f6]">General Context</option>
            </select>
          </div>

          <!-- Clear History Button -->
          <button onclick="clearChatHistory()" title="Clear conversation history"
            class="px-2.5 py-1.5 rounded-[6px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#262932] text-[12px] state-transition">
            Clear
          </button>
        </div>
      </div>

      <!-- Main Chat Thread Box -->
      <div class="bg-[#15171d] border border-[#262932] rounded-[10px] flex flex-col h-[650px] max-h-[75vh] shadow-sm overflow-hidden">
        
        <!-- Scrollable Message Area -->
        <div id="chatMessagesThread" class="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
          <!-- Initial Assistant Welcome Message -->
          <div class="flex items-start gap-3 max-w-[85%]">
            <div class="w-7 h-7 rounded-[4px] bg-[#3b5b8c] text-white flex items-center justify-center font-bold text-[12px] shrink-0 mt-0.5">
              AI
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-semibold text-[#f3f4f6]">Gemini Tutor</span>
                <span id="chatRoleBadge" class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-mono">Academic Tutor</span>
              </div>
              <div class="bg-[#1b1e25] border border-[#262932] rounded-[8px] p-3.5 text-[13px] text-[#d1d5db] leading-relaxed whitespace-pre-wrap">
Hello! I am your AI academic tutor powered by Gemini. You can ask me to unpack complex lecture topics, evaluate exam DP sub-minimum requirements, explain algorithms and math proofs, or generate rapid-fire review quizzes.

Choose your tutor role and model complexity above to get started.
              </div>
            </div>
          </div>
        </div>

        <!-- Prompt Suggestions Bar -->
        <div id="chatSuggestionsBar" class="px-4 py-2 border-t border-[#262932] bg-[#0f1115]/60 flex items-center gap-2 overflow-x-auto text-[12px]">
          <span class="text-[#6b7280] text-[11px] shrink-0">Suggestions:</span>
          <button onclick="sendQuickPrompt('Explain Bayes\' Theorem with a concrete example')" 
            class="px-2.5 py-1 rounded-[4px] bg-[#15171d] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] hover:border-[#3b5b8c] whitespace-nowrap state-transition">
            Explain Bayes' Theorem
          </button>
          <button onclick="sendQuickPrompt('How do I structure dynamic programming solutions for exams?')" 
            class="px-2.5 py-1 rounded-[4px] bg-[#15171d] border border-[#262932] text-[#9ca3af] hover:text-[#3b5b8c] hover:border-[#3b5b8c] whitespace-nowrap state-transition">
            DP Memoization vs Tabulation
          </button>
          <button onclick="sendQuickPrompt('Give me 3 rapid-fire revision questions on data structures')" 
            class="px-2.5 py-1 rounded-[4px] bg-[#15171d] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] hover:border-[#3b5b8c] whitespace-nowrap state-transition">
            Rapid Quiz Questions
          </button>
          <button onclick="sendQuickPrompt('Explain Big-O time complexity for merge sort vs quicksort')" 
            class="px-2.5 py-1 rounded-[4px] bg-[#15171d] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] hover:border-[#3b5b8c] whitespace-nowrap state-transition">
            Big-O Merge vs QuickSort
          </button>
        </div>

        <!-- Input Area Footer -->
        <div class="p-3 md:p-4 bg-[#15171d] border-t border-[#262932]">
          <form id="chatForm" onsubmit="handleSendChatMessage(event)" class="flex items-end gap-2">
            <div class="flex-1 bg-[#0f1115] border border-[#262932] rounded-[8px] focus-within:border-[#3b5b8c] state-transition p-2">
              <textarea id="chatInput" rows="2" placeholder="Ask a question or request an explanation (Press Enter to send, Shift+Enter for newline)..."
                onkeydown="handleChatKeyDown(event)"
                class="w-full bg-transparent text-[13px] text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none resize-none leading-relaxed"></textarea>
            </div>
            <button type="submit" id="chatSendBtn"
              class="h-[44px] px-4 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white font-medium text-[13px] flex items-center justify-center gap-1.5 shrink-0 state-transition disabled:opacity-50">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
              <span>Send</span>
            </button>
          </form>
          <div class="flex items-center justify-between text-[11px] text-[#6b7280] mt-2 px-1">
            <span id="chatModelIndicator">Using Gemini 3.5 Flash for general academic reasoning</span>
            <span>Multi-turn context preserved</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getChatClientScript(): string {
  return `
    // Multi-turn chat state
    let chatConversation = [];
    const CHAT_STORAGE_KEY = 'varsity_gemini_chat_history_v1';

    function initChatView() {
      try {
        const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
          chatConversation = JSON.parse(saved);
          renderChatMessages();
        }
      } catch (e) {
        console.warn('Failed to load chat history:', e);
      }
      populateChatCourses();
    }

    function populateChatCourses() {
      const select = document.getElementById('chatCourseSelect');
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="" class="bg-[#15171d] text-[#f3f4f6]">General Context</option>';
      if (window.userModules && Array.isArray(window.userModules)) {
        window.userModules.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.code;
          opt.className = 'bg-[#15171d] text-[#f3f4f6]';
          opt.textContent = m.code + ' - ' + m.name;
          select.appendChild(opt);
        });
      }
      if (current) select.value = current;
    }

    function handleChatRoleChange() {
      const role = document.getElementById('chatRoleSelect').value;
      const roleMap = {
        tutor: 'Academic Tutor',
        exam_prep: 'Exam Prep Specialist',
        coder: 'Code & Math Mentor',
        fast_quizzer: 'Speed Quizzer'
      };
      const badge = document.getElementById('chatRoleBadge');
      if (badge) badge.textContent = roleMap[role] || 'Academic Tutor';
    }

    function handleChatModelChange() {
      const tier = document.getElementById('chatModelTierSelect').value;
      const indicator = document.getElementById('chatModelIndicator');
      if (tier === 'complex') {
        indicator.textContent = 'Using Gemini 3.1 Pro Preview for complex multi-step reasoning & STEM';
      } else if (tier === 'fast') {
        indicator.textContent = 'Using Gemini 3.1 Flash Lite for ultra-fast replies and quick definitions';
      } else {
        indicator.textContent = 'Using Gemini 3.5 Flash for general academic reasoning';
      }
    }

    function clearChatHistory() {
      if (confirm('Clear the current conversation thread?')) {
        chatConversation = [];
        sessionStorage.removeItem(CHAT_STORAGE_KEY);
        const thread = document.getElementById('chatMessagesThread');
        if (thread) {
          thread.innerHTML = \`
            <div class="flex items-start gap-3 max-w-[85%]">
              <div class="w-7 h-7 rounded-[4px] bg-[#3b5b8c] text-white flex items-center justify-center font-bold text-[12px] shrink-0 mt-0.5">
                AI
              </div>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-[12px] font-semibold text-[#f3f4f6]">Gemini Tutor</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-mono">Academic Tutor</span>
                </div>
                <div class="bg-[#1b1e25] border border-[#262932] rounded-[8px] p-3.5 text-[13px] text-[#d1d5db] leading-relaxed whitespace-pre-wrap">
Conversation cleared. How can I help you study today?
                </div>
              </div>
            </div>
          \`;
        }
      }
    }

    function sendQuickPrompt(text) {
      const input = document.getElementById('chatInput');
      if (!input) return;
      input.value = text;
      input.focus();
      handleSendChatMessage();
    }

    function handleChatKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendChatMessage(event);
      }
    }

    function formatMarkdownText(text) {
      if (!text) return '';
      // Escape basic HTML
      let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks and inline code
      const bt = String.fromCharCode(96);
      const codeBlockRe = new RegExp(bt + '{3}([a-zA-Z0-9_-]*)[\\r\\n]?([\\s\\S]*?)' + bt + '{3}', 'g');
      const inlineCodeRe = new RegExp(bt + '([^' + bt + ']+)' + bt, 'g');

      formatted = formatted.replace(codeBlockRe, function(match, lang, code) {
        return '<pre class="my-2 p-3 bg-[#0f1115] border border-[#262932] rounded-[6px] overflow-x-auto text-[12px] font-mono text-[#9ca3af]"><code>' + code.trim() + '</code></pre>';
      });

      formatted = formatted.replace(inlineCodeRe, '<code class="px-1 py-0.5 bg-[#0f1115] border border-[#262932] rounded text-[12px] font-mono text-[#f3f4f6]">$1</code>');

      // Headings
      formatted = formatted.replace(/^### (.*$)/gim, '<h3 class="text-[14px] font-semibold text-[#f3f4f6] mt-2 mb-1">$1</h3>');
      formatted = formatted.replace(/^## (.*$)/gim, '<h2 class="text-[15px] font-bold text-[#f3f4f6] mt-2 mb-1">$1</h2>');

      // Bold & Italic
      formatted = formatted.replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="font-semibold text-[#f3f4f6]">$1</strong>');
      formatted = formatted.replace(/\\*(.*?)\\*/g, '<em class="italic text-[#d1d5db]">$1</em>');

      // Bullet points
      formatted = formatted.replace(/^\\s*-\\s+(.*$)/gim, '<li class="ml-4 list-disc text-[#d1d5db]">$1</li>');

      // Convert newlines
      formatted = formatted.replace(/\\n/g, '<br/>');
      return formatted;
    }

    function renderChatMessages() {
      const thread = document.getElementById('chatMessagesThread');
      if (!thread) return;

      let html = \`
        <div class="flex items-start gap-3 max-w-[85%]">
          <div class="w-7 h-7 rounded-[4px] bg-[#3b5b8c] text-white flex items-center justify-center font-bold text-[12px] shrink-0 mt-0.5">
            AI
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-[12px] font-semibold text-[#f3f4f6]">Gemini Tutor</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-mono">Academic Tutor</span>
            </div>
            <div class="bg-[#1b1e25] border border-[#262932] rounded-[8px] p-3.5 text-[13px] text-[#d1d5db] leading-relaxed whitespace-pre-wrap">
Hello! I am your AI academic tutor powered by Gemini. You can ask me to unpack complex lecture topics, evaluate exam DP sub-minimum requirements, explain algorithms and math proofs, or generate rapid-fire review quizzes.
            </div>
          </div>
        </div>
      \`;

      chatConversation.forEach(msg => {
        const isUser = msg.role === 'user';
        if (isUser) {
          html += \`
            <div class="flex items-start justify-end gap-3">
              <div class="max-w-[80%] space-y-1 text-right">
                <span class="text-[11px] text-[#6b7280]">You</span>
                <div class="bg-[#3b5b8c] text-white rounded-[8px] p-3 text-[13px] text-left leading-relaxed whitespace-pre-wrap">
                  \${escapeHtml(msg.content)}
                </div>
              </div>
            </div>
          \`;
        } else {
          html += \`
            <div class="flex items-start gap-3 max-w-[85%]">
              <div class="w-7 h-7 rounded-[4px] bg-[#3b5b8c] text-white flex items-center justify-center font-bold text-[12px] shrink-0 mt-0.5">
                AI
              </div>
              <div class="space-y-1 w-full">
                <div class="flex items-center gap-2">
                  <span class="text-[12px] font-semibold text-[#f3f4f6]">Gemini</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-mono">\${msg.model_used || 'Gemini'}</span>
                </div>
                <div class="bg-[#1b1e25] border border-[#262932] rounded-[8px] p-3.5 text-[13px] text-[#d1d5db] leading-relaxed">
                  \${formatMarkdownText(msg.content)}
                </div>
              </div>
            </div>
          \`;
        }
      });

      thread.innerHTML = html;
      thread.scrollTop = thread.scrollHeight;
    }

    async function handleSendChatMessage(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('chatInput');
      const text = (input ? input.value : '').trim();
      if (!text) return;

      const role_type = document.getElementById('chatRoleSelect').value;
      const model_tier = document.getElementById('chatModelTierSelect').value;
      const module_code = document.getElementById('chatCourseSelect').value;
      const sendBtn = document.getElementById('chatSendBtn');

      // Append user message to history
      chatConversation.push({
        role: 'user',
        content: text,
        timestamp: new Date().toISOString()
      });

      // Clear input
      if (input) input.value = '';
      renderChatMessages();

      // Append temporary typing indicator bubble
      const thread = document.getElementById('chatMessagesThread');
      const typingId = 'chat-typing-' + Date.now();
      const typingBubble = document.createElement('div');
      typingBubble.id = typingId;
      typingBubble.className = 'flex items-start gap-3 max-w-[85%]';
      typingBubble.innerHTML = \`
        <div class="w-7 h-7 rounded-[4px] bg-[#3b5b8c] text-white flex items-center justify-center font-bold text-[12px] shrink-0 mt-0.5">
          AI
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-[12px] font-semibold text-[#f3f4f6]">Gemini Tutor</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-mono">Thinking...</span>
          </div>
          <div class="bg-[#1b1e25] border border-[#262932] rounded-[8px] p-3 text-[13px] text-[#9ca3af] flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#3b5b8c] animate-bounce"></span>
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#3b5b8c] animate-bounce [animation-delay:0.2s]"></span>
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#3b5b8c] animate-bounce [animation-delay:0.4s]"></span>
            <span class="ml-1 text-[12px]">Analyzing response with Gemini...</span>
          </div>
        </div>
      \`;
      thread.appendChild(typingBubble);
      thread.scrollTop = thread.scrollHeight;

      if (sendBtn) sendBtn.disabled = true;

      try {
        const payload = {
          messages: chatConversation.map(m => ({
            role: m.role,
            content: m.content
          })),
          role_type,
          model_tier,
          module_code
        };

        const res = await apiFetch('/api/v1/ai/chat', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        // Remove typing indicator
        const el = document.getElementById(typingId);
        if (el) el.remove();

        // Push model reply
        chatConversation.push({
          role: 'model',
          content: res.reply || 'No response received.',
          model_used: res.model_used,
          timestamp: res.timestamp || new Date().toISOString()
        });

        // Save to storage
        try {
          sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatConversation));
        } catch (err) {}

        renderChatMessages();
      } catch (err) {
        console.error('Chat error:', err);
        const el = document.getElementById(typingId);
        if (el) el.remove();

        chatConversation.push({
          role: 'model',
          content: 'Unable to connect to Gemini at this moment. ' + (err.message || 'Please check your connection and try again.'),
          model_used: 'Offline Fallback',
          timestamp: new Date().toISOString()
        });
        renderChatMessages();
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      }
    }
  `;
}
