// Kilo AI Chat Hub Client Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const chatFeed = document.getElementById('chat-feed');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-generation-btn');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const welcomeContainer = document.getElementById('welcome-container');
  const activeModelBadge = document.getElementById('active-model-badge');
  const sessionStats = document.getElementById('session-stats');
  
  // Settings Panel
  const modelSelect = document.getElementById('model-select');
  const refreshModelsBtn = document.getElementById('refresh-models-btn');
  const advSettingsTrigger = document.getElementById('adv-settings-trigger');
  const advSettingsContent = document.getElementById('adv-settings-content');
  const temperatureInput = document.getElementById('temperature');
  const tempVal = document.getElementById('temp-val');
  const maxTokensInput = document.getElementById('max-tokens');
  
  // Status Bar
  const serverStatus = document.getElementById('server-status');
  const statusText = serverStatus.querySelector('.status-text');

  // Auth & Quota Elements
  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const loginInput = document.getElementById('login-input');
  const loginError = document.getElementById('login-error');
  const userCard = document.getElementById('user-card');
  const userNameDisplay = document.getElementById('user-name-display');
  const userTierDisplay = document.getElementById('user-tier-display');
  const logoutBtn = document.getElementById('logout-btn');
  const quotaPercentage = document.getElementById('quota-percentage');
  const quotaProgressIndicator = document.getElementById('quota-progress-indicator');
  const quotaUsedDisplay = document.getElementById('quota-used-display');
  const quotaLimitDisplay = document.getElementById('quota-limit-display');
  const loginTriggerBtn = document.getElementById('login-trigger-btn');
  const closeLoginBtn = document.getElementById('close-login-btn');
  const loginEmailGroup = document.getElementById('login-email-group');
  const loginOtpGroup = document.getElementById('login-otp-group');
  const otpInput = document.getElementById('otp-input');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  
  // Mobile Header & Sidebar Elements
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const newChatHeaderBtn = document.getElementById('new-chat-header-btn');
  const mobileProfileBtn = document.getElementById('mobile-profile-btn');
  const sidebar = document.querySelector('.sidebar');

  // --- App State ---
  let chatMessages = [];
  let abortController = null;
  let isGenerating = false;
  let currentUser = null;
  let isOtpPhase = false;
  let registeringEmail = '';
  let registeringName = '';
  let selectedPlanTier = '';
  let qrTimerInterval = null;
  let guestMessageCount = parseInt(localStorage.getItem('kilo_guest_count') || '0');
  let currentChatId = null;
  let chatHistory = JSON.parse(localStorage.getItem('kilo_chat_history') || '[]');

  function persistLocalHistory() {
    localStorage.setItem('kilo_chat_history', JSON.stringify(chatHistory));
  }

  // History DOM
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  // --- Initialize App ---
  loadSettings();
  checkServerConnection();
  adjustTextareaHeight();
  initGoogleSignIn();

  // Restore User Session
  const savedUser = localStorage.getItem('kilo_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    userNameDisplay.textContent = currentUser.name;
    userTierDisplay.textContent = currentUser.userType;
    loginOverlay.classList.add('hidden');
    userCard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    if (loginTriggerBtn) loginTriggerBtn.classList.add('hidden');
    
    // Show/hide Upgrade button based on Free Tier status
    const upgradeTierBtn = document.getElementById('upgrade-tier-btn');
    if (upgradeTierBtn) {
      if (currentUser.userType === 'Free') {
        upgradeTierBtn.classList.remove('hidden');
      } else {
        upgradeTierBtn.classList.add('hidden');
      }
    }

    // Set profile avatar letter
    if (mobileProfileBtn && currentUser.name) {
      const letterSpan = mobileProfileBtn.querySelector('.avatar-letter');
      if (letterSpan) letterSpan.textContent = currentUser.name.charAt(0).toUpperCase();
    }
    
    checkUserStats();
  } else {
    // Guest Mode by default - Login screen is hidden on load
    loginOverlay.classList.add('hidden');
    userCard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    if (loginTriggerBtn) loginTriggerBtn.classList.remove('hidden');
    
    if (mobileProfileBtn) {
      const letterSpan = mobileProfileBtn.querySelector('.avatar-letter');
      if (letterSpan) letterSpan.textContent = 'G'; // Guest
    }
  }

  // --- Event Listeners ---

  // Bind Login Trigger in sidebar
  if (loginTriggerBtn) {
    loginTriggerBtn.addEventListener('click', () => {
      loginOverlay.classList.remove('hidden');
      loginInput.focus();
    });
  }

  // Bind Close Login button inside card
  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      loginOverlay.classList.add('hidden');
      resetLoginForm();
    });
  }

  // Bind Login Submit
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isOtpPhase) {
      attemptLogin(loginInput.value.trim());
    } else {
      verifyOtp(loginInput.value.trim(), otpInput.value.trim());
    }
  });

  // Bind Pricing Cards click listeners
  const pricingGrid = document.querySelector('.pricing-grid');
  if (pricingGrid) {
    pricingGrid.addEventListener('click', async (e) => {
      const selectBtn = e.target.closest('.pricing-select-btn');
      if (!selectBtn) return;
      
      const selectedTier = selectBtn.getAttribute('data-tier');
      if (!registeringEmail || !selectedTier) return;
      
      if (selectedTier === 'Free') {
        // Register Free Plan instantly!
        await executeRegistration(selectedTier, selectBtn);
      } else {
        // Call backend to create Razorpay/Sandbox Order
        selectBtn.classList.add('loading');
        selectBtn.disabled = true;
        loginError.classList.add('hidden');
        
        try {
          const response = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tier: selectedTier,
              email: registeringEmail
            })
          });
          
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to initialize payment.');
          }
          
          selectedPlanTier = selectedTier;
          
          if (data.isSandbox) {
            // Show standard glassmorphic sandbox Card Checkout form
            let planName = 'Premium Plan';
            let planPrice = 'Rs 499/mo';
            let numericPrice = 499;
            if (selectedTier === 'HalfYear') {
              planName = 'Half Year Plan';
              planPrice = 'Rs 8,099/6mo';
              numericPrice = 8099;
            } else if (selectedTier === 'Yearly') {
              planName = 'Yearly Plan';
              planPrice = 'Rs 15,299/yr';
              numericPrice = 15299;
            }
            document.getElementById('checkout-plan-name').textContent = planName;
            document.getElementById('checkout-plan-price').textContent = planPrice;
            
            // Generate UPI QR Code URL
            const qrImageEl = document.getElementById('upi-qr-image');
            if (qrImageEl) {
              const upiPayload = `upi://pay?pa=kiloai@sandbox&pn=KiloAIChatHub&am=${numericPrice}&cu=INR`;
              qrImageEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiPayload)}`;
            }
            
            // Start Timer countdown (5 minutes)
            startQrExpiryTimer();
            
            document.getElementById('registration-tier-container').classList.add('hidden');
            document.getElementById('checkout-container').classList.remove('hidden');
            document.getElementById('login-overlay').classList.remove('registration-phase');
          } else {
            // Open official Razorpay modal!
            const options = {
              key: data.keyId,
              amount: data.amount,
              currency: data.currency,
              name: "Kilo AI Chat Hub",
              description: selectedTier === 'Paid' ? 'Premium Plan Activation' : (selectedTier === 'HalfYear' ? 'Half Year Plan Activation' : 'Yearly Plan Activation'),
              order_id: data.orderId,
              handler: async function (paymentResponse) {
                selectBtn.classList.add('loading');
                try {
                  const verifyRes = await fetch('/api/verify-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: registeringEmail,
                      name: registeringName,
                      tier: selectedPlanTier,
                      razorpay_payment_id: paymentResponse.razorpay_payment_id,
                      razorpay_order_id: paymentResponse.razorpay_order_id,
                      razorpay_signature: paymentResponse.razorpay_signature
                    })
                  });
                  
                  const verifyData = await verifyRes.json();
                  if (!verifyRes.ok) {
                    throw new Error(verifyData.error || 'Verification failed');
                  }
                  
                  handleLoginSuccess(verifyData.user, verifyData.stats);
                  resetLoginForm();
                } catch (verifyErr) {
                  loginError.textContent = "Payment verification failed: " + verifyErr.message;
                  loginError.classList.remove('hidden');
                } finally {
                  selectBtn.classList.remove('loading');
                }
              },
              prefill: {
                name: registeringName,
                email: registeringEmail
              },
              theme: {
                color: "#6366f1"
              }
            };
            const rzp = new Razorpay(options);
            rzp.open();
          }
        } catch (err) {
          loginError.textContent = err.message;
          loginError.classList.remove('hidden');
        } finally {
          selectBtn.classList.remove('loading');
          selectBtn.disabled = false;
        }
      }
    });
  }

  // Helper function to register the user record in Local DB
  async function executeRegistration(tier, actionButton) {
    actionButton.classList.add('loading');
    actionButton.disabled = true;
    loginError.classList.add('hidden');
    
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registeringEmail,
          name: registeringName,
          tier: tier
        })
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server returned HTML error. Status: ${response.status}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      // Successfully registered and authenticated!
      handleLoginSuccess(data.user, data.stats);
      resetLoginForm();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
      throw err;
    } finally {
      actionButton.classList.remove('loading');
      actionButton.disabled = false;
    }
  }

  // Bind Checkout Back Button
  const checkoutBackBtn = document.getElementById('checkout-back-btn');
  if (checkoutBackBtn) {
    checkoutBackBtn.addEventListener('click', () => {
      document.getElementById('checkout-container').classList.add('hidden');
      document.getElementById('registration-tier-container').classList.remove('hidden');
      document.getElementById('login-overlay').classList.add('registration-phase'); // Expand modal to 3-column width
    });
  }

  // Bind Checkout Form Submit
  const checkoutForm = document.getElementById('checkout-form');
  const checkoutPayBtn = document.getElementById('checkout-pay-btn');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!selectedPlanTier) return;
      
      checkoutPayBtn.classList.add('loading');
      checkoutPayBtn.disabled = true;
      loginError.classList.add('hidden');
      
      // Simulate payment network contact for 1.5 seconds
      setTimeout(async () => {
        try {
          await executeRegistration(selectedPlanTier, checkoutPayBtn);
        } catch (err) {
          loginError.textContent = err.message;
          loginError.classList.remove('hidden');
        } finally {
          checkoutPayBtn.classList.remove('loading');
          checkoutPayBtn.disabled = false;
        }
      }, 1500);
    });
  }

  // Auto-format card number
  const cardNumberInput = document.getElementById('card-number');
  if (cardNumberInput) {
    cardNumberInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }

  // Auto-format expiry date
  const cardExpiryInput = document.getElementById('card-expiry');
  if (cardExpiryInput) {
    cardExpiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  // Bind Sandbox Checkout Payment Tabs
  const tabCard = document.getElementById('tab-card');
  const tabUpi = document.getElementById('tab-upi');
  const cardPanel = document.getElementById('card-payment-panel');
  const upiPanel = document.getElementById('upi-payment-panel');
  
  const cardFields = [
    document.getElementById('card-name'),
    document.getElementById('card-number'),
    document.getElementById('card-expiry'),
    document.getElementById('card-cvv')
  ];

  if (tabCard && tabUpi) {
    tabCard.addEventListener('click', () => {
      // Toggle Tabs active classes
      tabCard.style.background = "rgba(99, 102, 241, 0.15)";
      tabCard.style.borderColor = "var(--accent-indigo)";
      tabCard.style.color = "var(--text-primary)";
      
      tabUpi.style.background = "transparent";
      tabUpi.style.borderColor = "var(--border-color)";
      tabUpi.style.color = "var(--text-muted)";
      
      // Toggle Panels
      if (cardPanel) cardPanel.classList.remove('hidden');
      if (upiPanel) upiPanel.classList.add('hidden');
      
      // Add Required tags
      cardFields.forEach(f => { if (f) f.required = true; });
    });

    tabUpi.addEventListener('click', () => {
      // Toggle Tabs active classes
      tabUpi.style.background = "rgba(99, 102, 241, 0.15)";
      tabUpi.style.borderColor = "var(--accent-indigo)";
      tabUpi.style.color = "var(--text-primary)";
      
      tabCard.style.background = "transparent";
      tabCard.style.borderColor = "var(--border-color)";
      tabCard.style.color = "var(--text-muted)";
      
      // Toggle Panels
      if (cardPanel) cardPanel.classList.add('hidden');
      if (upiPanel) upiPanel.classList.remove('hidden');
      
      // Remove Required tags
      cardFields.forEach(f => { if (f) f.required = false; });
    });
  }

  // Timer countdown helper
  function startQrExpiryTimer() {
    if (qrTimerInterval) clearInterval(qrTimerInterval);
    
    let secondsLeft = 300; // 5 minutes
    const timerDisplay = document.getElementById('qr-expiry-timer');
    if (!timerDisplay) return;
    
    timerDisplay.textContent = "05:00";
    timerDisplay.style.color = "var(--accent-indigo)";
    
    qrTimerInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(qrTimerInterval);
        timerDisplay.textContent = "QR Code Expired";
        timerDisplay.style.color = "var(--accent-red)";
      } else {
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        const paddedSec = String(seconds).padStart(2, '0');
        const paddedMin = String(minutes).padStart(2, '0');
        timerDisplay.textContent = `${paddedMin}:${paddedSec}`;
      }
    }, 1000);
  }

  // Bind Logout
  logoutBtn.addEventListener('click', logout);

  // Bind Upgrade Button
  const upgradeTierBtnEl = document.getElementById('upgrade-tier-btn');
  if (upgradeTierBtnEl) {
    upgradeTierBtnEl.addEventListener('click', () => {
      if (!currentUser) return;
      
      // Save current user info to registration state
      registeringEmail = currentUser.email;
      registeringName = currentUser.name || '';
      
      // Show pricing overlay
      const emailDisplay = document.getElementById('registering-email-display');
      if (emailDisplay) emailDisplay.textContent = currentUser.email;
      
      const loginFormEl = document.getElementById('login-form');
      const regContainer = document.getElementById('registration-tier-container');
      const checkoutContainer = document.getElementById('checkout-container');
      if (loginFormEl) loginFormEl.classList.add('hidden');
      if (regContainer) regContainer.classList.remove('hidden');
      if (checkoutContainer) checkoutContainer.classList.add('hidden');
      
      const overlay = document.getElementById('login-overlay');
      if (overlay) {
        overlay.classList.add('registration-phase');
        overlay.classList.remove('hidden');
      }
      
      lucide.createIcons();
    });
  }

  fetchModelsList(true); // silent initial load

  // Bind close preview button
  const closePreviewBtn = document.getElementById('close-preview-btn');
  const previewPanel = document.getElementById('preview-panel');
  if (closePreviewBtn && previewPanel) {
    closePreviewBtn.addEventListener('click', () => {
      previewPanel.classList.add('collapsed');
    });
  }

  // --- Event Listeners ---

  // Auto-resize chat input
  chatInput.addEventListener('input', adjustTextareaHeight);
  
  // Keypress event for chat input (Enter to send, Shift+Enter for newline)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Action Buttons
  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', stopGeneration);
  if (clearChatBtn) clearChatBtn.addEventListener('click', startNewChat);
  newChatBtn.addEventListener('click', startNewChat);
  if (newChatHeaderBtn) newChatHeaderBtn.addEventListener('click', startNewChat);
  
  // Mobile Sidebar Event Listeners
  if (toggleSidebarBtn && sidebar && sidebarOverlay) {
    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    });
  }

  if (closeSidebarBtn && sidebar && sidebarOverlay) {
    closeSidebarBtn.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  }

  if (sidebarOverlay && sidebar) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  }

  if (mobileProfileBtn) {
    mobileProfileBtn.addEventListener('click', () => {
      if (sidebar && sidebarOverlay) {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
      }
    });
  }
  
  // --- Custom Model Dropdown Logic ---
  const modelDropdownTrigger = document.getElementById('model-dropdown-trigger');
  const modelDropdownPanel = document.getElementById('model-dropdown-panel');
  const modelDropdownList = document.getElementById('model-dropdown-list');
  const modelDisplayText = document.getElementById('model-display-text');

  function getShortModelName(fullName) {
    // Remove "(free)" suffix and trim
    let name = fullName.replace(/\s*\(free\)\s*$/i, '').trim();
    // If name is too long, shorten it
    if (name.length > 28) {
      name = name.substring(0, 26) + '…';
    }
    return name;
  }

  function updateModelDisplayText() {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    if (selectedOption) {
      modelDisplayText.textContent = getShortModelName(selectedOption.textContent);
    }
  }

  function populateCustomDropdown() {
    modelDropdownList.innerHTML = '';
    for (let i = 0; i < modelSelect.options.length; i++) {
      const opt = modelSelect.options[i];
      const isActive = opt.value === modelSelect.value;
      
      const item = document.createElement('div');
      item.className = 'model-dropdown-item' + (isActive ? ' active' : '');
      item.dataset.value = opt.value;
      
      const shortName = getShortModelName(opt.textContent);
      const isFree = opt.textContent.toLowerCase().includes('free') || opt.value.includes(':free');
      
      item.innerHTML = `
        <svg class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <div class="model-item-info">
          <span class="model-item-name">${shortName}</span>
          <span class="model-item-desc">${isFree ? 'Free tier model' : 'Premium model'}</span>
        </div>
        ${isFree ? '<span class="model-item-badge">Free</span>' : ''}
      `;
      
      item.addEventListener('click', () => {
        modelSelect.value = opt.value;
        saveSetting('selectedModel', modelSelect.value);
        if (activeModelBadge) activeModelBadge.textContent = modelSelect.value;
        updateModelDisplayText();
        closeModelDropdown();
        populateCustomDropdown();
      });
      
      modelDropdownList.appendChild(item);
    }
  }

  function openModelDropdown() {
    modelDropdownPanel.classList.remove('hidden');
    modelDropdownTrigger.classList.add('open');
    populateCustomDropdown();
  }

  function closeModelDropdown() {
    modelDropdownPanel.classList.add('hidden');
    modelDropdownTrigger.classList.remove('open');
  }

  function toggleModelDropdown() {
    if (modelDropdownPanel.classList.contains('hidden')) {
      openModelDropdown();
    } else {
      closeModelDropdown();
    }
  }

  // Click trigger to open/close
  if (modelDropdownTrigger) {
    modelDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelDropdown();
    });
  }

  // Stop panel clicks from reaching the trigger
  if (modelDropdownPanel) {
    modelDropdownPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (modelDropdownPanel && !modelDropdownPanel.contains(e.target) && !modelDropdownTrigger.contains(e.target)) {
      closeModelDropdown();
    }
  });

  // Keep native select in sync (for any programmatic changes)
  modelSelect.addEventListener('change', () => {
    saveSetting('selectedModel', modelSelect.value);
    if (activeModelBadge) activeModelBadge.textContent = modelSelect.value;
    updateModelDisplayText();
    populateCustomDropdown();
  });

  // Initial display text
  updateModelDisplayText();

  // Refresh models list manually
  if (refreshModelsBtn) {
    refreshModelsBtn.addEventListener('click', () => {
      fetchModelsList(false);
    });
  }

  // Advanced settings toggle
  if (advSettingsTrigger) {
    advSettingsTrigger.addEventListener('click', () => {
      const isHidden = advSettingsContent.classList.contains('hidden');
      if (isHidden) {
        advSettingsContent.classList.remove('hidden');
        advSettingsTrigger.classList.add('active');
      } else {
        advSettingsContent.classList.add('hidden');
        advSettingsTrigger.classList.remove('active');
      }
    });
  }

  // Temp slider update
  temperatureInput.addEventListener('input', () => {
    tempVal.textContent = temperatureInput.value;
    saveSetting('temperature', temperatureInput.value);
  });

  // Max tokens update
  maxTokensInput.addEventListener('input', () => {
    saveSetting('maxTokens', maxTokensInput.value);
  });

  // --- Helper Functions ---

  // Auto-grow textarea
  function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
  }

  // Save a config setting locally
  function saveSetting(key, val) {
    localStorage.setItem(`kilo_${key}`, val);
  }

  // Load saved settings
  function loadSettings() {
    const savedModel = localStorage.getItem('kilo_selectedModel');
    if (savedModel) {
      if (activeModelBadge) activeModelBadge.textContent = savedModel;
      // Add option dynamically to select list if not already present
      let exists = false;
      for (let i = 0; i < modelSelect.options.length; i++) {
        if (modelSelect.options[i].value === savedModel) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        const option = document.createElement('option');
        option.value = savedModel;
        option.textContent = savedModel;
        modelSelect.appendChild(option);
      }
      modelSelect.value = savedModel;
    }

    const savedTemp = localStorage.getItem('kilo_temperature');
    if (savedTemp) {
      temperatureInput.value = savedTemp;
      tempVal.textContent = savedTemp;
    }

    const savedMaxTokens = localStorage.getItem('kilo_maxTokens');
    if (savedMaxTokens) {
      maxTokensInput.value = savedMaxTokens;
    }
  }

  // Verify connection to the local Node.js proxy server
  async function checkServerConnection() {
    serverStatus.className = 'connection-status connecting';
    statusText.textContent = 'Connecting to Local Proxy...';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/api/models', { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        serverStatus.className = 'connection-status connected';
        statusText.textContent = 'Kilo AI Proxy Connected';
      } else {
        throw new Error('Server returned non-OK status');
      }
    } catch (err) {
      serverStatus.className = 'connection-status disconnected';
      statusText.textContent = 'Proxy Offline / Checking...';
    }
  }

  // Load models dynamically from /api/models proxy (keyless)
  async function fetchModelsList(silent = false) {
    const refreshIcon = refreshModelsBtn ? refreshModelsBtn.querySelector('i, svg') : null;
    if (refreshIcon) refreshIcon.classList.add('animation-spin');

    const isPaid = currentUser && (currentUser.userType === 'Paid User' || currentUser.userType === 'Paid User (Unlimited)');

    if (!silent) {
      statusText.textContent = isPaid ? 'Syncing premium models...' : 'Syncing free models...';
      serverStatus.className = 'connection-status connecting';
    }

    try {
      let response;
      let data;
      const loginIdParam = currentUser ? '&loginId=' + encodeURIComponent(currentUser.loginId) : '';
      try {
        response = await fetch('/api/models?t=' + Date.now() + loginIdParam);
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error');
        }
        data = await response.json();
      } catch (proxyErr) {
        console.warn('Local proxy models fetch failed, attempting direct gateway call...', proxyErr);
        const directUrl = isPaid 
          ? 'https://god-maog.onrender.com/openai/v1/models?t=' + Date.now() 
          : 'https://api.kilo.ai/api/gateway/models?t=' + Date.now();
        response = await fetch(directUrl);
        if (!response.ok) {
          throw new Error('Direct gateway call failed');
        }
        data = await response.json();
        serverStatus.className = 'connection-status connected';
        statusText.textContent = isPaid ? 'Connected (Direct Paid Gateway)' : 'Connected (Direct Gateway)';
      }

      if (data && data.data && Array.isArray(data.data)) {
        const currentSelected = localStorage.getItem('kilo_selectedModel') || modelSelect.value;
        modelSelect.innerHTML = '';

        let filteredModels;
        if (isPaid) {
          filteredModels = data.data; // Show all models returned by god-maog
        } else {
          // Filter to only include free models in Kilo AI (by isFree property or ID pattern)
          filteredModels = data.data.filter(modelObj => {
            const modelId = String(modelObj.id || "").toLowerCase();
            return modelObj.isFree === true || modelId.includes(':free') || modelId.endsWith('/free') || modelId.endsWith('-free');
          });
        }

        filteredModels.forEach(modelObj => {
          const opt = document.createElement('option');
          opt.value = modelObj.id;
          opt.textContent = modelObj.name || modelObj.id;
          modelSelect.appendChild(opt);
        });

        // Restore selected model if it is in the list, otherwise select first
        if (filteredModels.find(m => m.id === currentSelected)) {
          modelSelect.value = currentSelected;
        } else if (filteredModels.length > 0) {
          modelSelect.value = filteredModels[0].id;
          saveSetting('selectedModel', modelSelect.value);
          if (activeModelBadge) activeModelBadge.textContent = modelSelect.value;
        } else if (!silent) {
          alert(isPaid ? 'No paid models available from endpoint.' : 'No free models available from Kilo AI. Please try again later.');
        }

        if (!silent) {
          serverStatus.className = 'connection-status connected';
          statusText.textContent = isPaid ? 'Premium models synchronized' : 'Free models synchronized';
        }

        // Sync custom dropdown with newly fetched models
        updateModelDisplayText();
        populateCustomDropdown();
      } else if (!silent) {
        console.warn('Unexpected models response format:', data);
        alert('Failed to parse models list from server.');
        serverStatus.className = 'connection-status disconnected';
        statusText.textContent = 'Sync failed (bad data)';
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        alert('Failed to synchronize models list: ' + err.message);
        serverStatus.className = 'connection-status disconnected';
        statusText.textContent = 'Sync failed';
      }
    } finally {
      if (refreshIcon) refreshIcon.classList.remove('animation-spin');
    }
  }

  // --- Chat Stream Logic ---

  async function sendMessage() {
    const prompt = chatInput.value.trim();
    if (!prompt) return;
    if (isGenerating) return;

    // Enforce 3-message limit for guest users (not signed in)
    if (!currentUser && guestMessageCount >= 3) {
      loginOverlay.classList.remove('hidden');
      loginError.textContent = "You have reached the guest limit of 3 messages. Please Sign In / Register to continue!";
      loginError.classList.remove('hidden');
      loginInput.focus();
      return;
    }

    // Hide welcome overlay on first message
    if (welcomeContainer) {
      welcomeContainer.remove();
    }

    // Add user message to state & interface
    chatMessages.push({ role: 'user', content: prompt });
    appendMessage('user', prompt);

    // Auto-save history on user message
    saveCurrentChat();

    if (!currentUser) {
      guestMessageCount++;
      localStorage.setItem('kilo_guest_count', String(guestMessageCount));
    }

    // Reset input text & heights
    chatInput.value = '';
    adjustTextareaHeight();

    // Setup streaming state
    isGenerating = true;
    sendBtn.disabled = true;
    stopBtn.classList.remove('hidden');
    
    // Add temporary AI message container
    const messageDiv = appendMessage('ai', '');
    const contentDiv = messageDiv.querySelector('.message-content');
    
    // Show typing skeletons
    contentDiv.innerHTML = `
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;

    abortController = new AbortController();

    try {
      let response;
      const sanitizedMessages = sanitizeMessages([
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Always respond in English by default. If the user writes in a different language, respond in that same language. Be concise, accurate, and helpful.'
        },
        ...chatMessages
      ]);

      const isPaid = currentUser && (currentUser.userType === 'Paid User' || currentUser.userType === 'Paid User (Unlimited)');
      const requestBody = {
        model: modelSelect.value,
        messages: sanitizedMessages,
        stream: true,
        temperature: parseFloat(temperatureInput.value),
        max_tokens: parseInt(maxTokensInput.value),
        loginId: currentUser ? currentUser.loginId : ''
      };

      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortController.signal
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Proxy error');
        }
      } catch (proxyErr) {
        if (proxyErr.name === 'AbortError') {
          throw proxyErr;
        }
        console.warn('Local proxy chat failed, attempting direct gateway call...', proxyErr);
        const directChatUrl = isPaid 
          ? 'https://god-maog.onrender.com/openai/v1/chat/completions' 
          : 'https://api.kilo.ai/api/gateway/chat/completions';
        response = await fetch(directChatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortController.signal
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Direct gateway call failed: ${errText}`);
        }
      }

      // Clear typing indicator
      contentDiv.innerHTML = '';
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value, { stream: true });
        
        // Parse SSE formatted chunks
        const lines = rawText.split('\n');
        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine) continue;
          if (cleanedLine === 'data: [DONE]') continue;

          if (cleanedLine.startsWith('data: ')) {
            try {
              const jsonStr = cleanedLine.substring(6);
              const parsed = JSON.parse(jsonStr);
              const deltaContent = parsed.choices?.[0]?.delta?.content;
              if (deltaContent) {
                aiResponseText += deltaContent;
                contentDiv.innerHTML = formatMarkdown(aiResponseText);
                chatFeed.scrollTop = chatFeed.scrollHeight;
                
                // Real-time estimate update for better UI feedback
                if (currentUser) {
                  const currentUsedVal = parseInt(quotaUsedDisplay.textContent.replace(/,/g, '')) || 0;
                  const estDelta = Math.ceil(deltaContent.length / 4);
                  updateQuotaUI(currentUsedVal + estDelta, currentUser.dailyLimit);
                }
              }
            } catch (jsonErr) {
              // Ignore partial JSON parsing errors
            }
          }
        }
      }

      // Generation complete
      chatMessages.push({ role: 'assistant', content: aiResponseText });
      saveCurrentChat(); // Save after AI response
      updateStats();
      checkUserStats();

    } catch (err) {
      if (err.name === 'AbortError') {
        contentDiv.innerHTML += ` <em class="text-muted">(Stopped by user)</em>`;
        chatMessages.push({ role: 'assistant', content: contentDiv.textContent.replace('(Stopped by user)', '').trim() });
      } else {
        contentDiv.innerHTML = `<span style="color: var(--accent-red); font-weight: 500;"><i data-lucide="alert-circle" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Error: ${err.message}</span>`;
        lucide.createIcons();
      }
      console.error('Chat error:', err);
    } finally {
      isGenerating = false;
      sendBtn.disabled = false;
      stopBtn.classList.add('hidden');
      abortController = null;
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }
  }

  function stopGeneration() {
    if (abortController) {
      abortController.abort();
    }
  }

  function resetChat() {
    stopGeneration();
    chatFeed.innerHTML = '';
    chatMessages = [];
    updateStats();
    
    // Re-render initial welcome state
    chatFeed.appendChild(welcomeContainer || createWelcomeElement());
    lucide.createIcons();
  }

  function updateStats() {
    const totalCount = chatMessages.length;
    sessionStats.textContent = `${totalCount} message${totalCount !== 1 ? 's' : ''}`;
  }

  // Helper to append bubble DOM element
  function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar';
    
    const icon = role === 'user' ? 'user' : 'bot';
    avatarDiv.innerHTML = `<i data-lucide="${icon}"></i>`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMarkdown(text);
    
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentDiv);
    
    chatFeed.appendChild(msgDiv);
    lucide.createIcons();
    
    // Scroll view
    chatFeed.scrollTop = chatFeed.scrollHeight;
    return msgDiv;
  }

  function createWelcomeElement() {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-container';
    welcome.id = 'welcome-container';
    welcome.innerHTML = `
      <div class="welcome-icon">
        <i data-lucide="sparkles"></i>
      </div>
      <h2>Welcome to Kilo AI Chat Hub</h2>
      <p class="subtitle">A premium, keyless, local interface for the Kilo AI Gateway.</p>
      
      <div class="tips-grid">
        <div class="tip-card">
          <div class="tip-header">
            <i data-lucide="shield-check" class="text-indigo"></i>
            <h3>Keyless Access</h3>
          </div>
          <p>No API key required! Access Kilo AI Gateway's free tier models completely at no cost.</p>
        </div>
        
        <div class="tip-card">
          <div class="tip-header">
            <i data-lucide="zap" class="text-pink"></i>
            <h3>Instant Streaming</h3>
          </div>
          <p>Experience real-time, token-by-token response streams for coding and creative generation.</p>
        </div>

        <div class="tip-card">
          <div class="tip-header">
            <i data-lucide="shuffle" class="text-orange"></i>
            <h3>Auto Routing</h3>
          </div>
          <p>Use <code>kilo-auto/free</code> to automatically direct your prompts to the best available free model.</p>
        </div>
      </div>

      <div class="setup-hint">
        <p><i data-lucide="sparkles"></i> Select a model above the input bar and click Send to start chatting!</p>
      </div>
    `;
    return welcome;
  }

  function extractTextFromContent(content) {
    if (typeof content === 'string') {
      let text = content;
      text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
      text = text.replace(/<img[^>]*>/gi, '');
      text = text.replace(/data:image\/[^;]+;base64,[^\s"']+/gi, '');
      text = text.replace(/data:image\/[^;]+;[^\s"']+/gi, '');
      return text;
    }
    if (Array.isArray(content)) {
      return content
        .filter(part => part && part.type === 'text')
        .map(part => extractTextFromContent(part.text))
        .join('\n');
    }
    return String(content || '');
  }

  function sanitizeMessages(messages) {
    return messages.map(msg => {
      const text = extractTextFromContent(msg.content);
      if (typeof msg.content !== 'string' || (text !== msg.content && msg.content)) {
        console.warn('Stripping non-text content from message before sending to API.');
      }
      return { ...msg, content: text };
    });
  }

  // --- Basic Markdown Helper Parser ---
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return 'cb-' + Math.abs(hash);
  }

  function formatMarkdown(text) {
    if (!text) return '';
    
    const codeBlocks = [];
    
    // 1. Extract code blocks and replace with placeholders
    let processed = text.replace(/```([a-zA-Z0-9:#+-]+)?\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
      const cleanLang = lang ? lang.toLowerCase().trim() : '';
      const isPreviewable = ['html', 'svg', 'xml', 'js', 'javascript', 'css'].includes(cleanLang);
      const cleanCode = code.trim();
      const blockId = hashCode(cleanCode);
      
      let blockHtml = '';
      if (isPreviewable) {
        blockHtml = `
          <div class="code-preview-container" id="${blockId}">
            <div class="code-header-tabs">
              <span class="code-lang-label">${cleanLang}</span>
              <div class="code-actions-group">
                <button class="code-action-btn" onclick="copyCode(this, '${blockId}')" title="Copy Code">
                  <i data-lucide="copy" style="width:14px;height:14px;"></i>
                </button>
                <button class="code-action-btn" onclick="downloadCode('${blockId}', '${cleanLang}')" title="Download Code">
                  <i data-lucide="download" style="width:14px;height:14px;"></i>
                </button>
                <button class="code-action-btn preview-action-btn" onclick="openRightPreview('${blockId}')" title="Preview Code">
                  <i data-lucide="play" style="width:14px;height:14px;"></i>
                </button>
              </div>
            </div>
            <div class="tab-content code-tab-content">
              <pre><code class="language-${cleanLang}">${escapeHtml(cleanCode)}</code></pre>
            </div>
          </div>
        `;
      } else {
        blockHtml = `
          <div class="code-preview-container" id="${blockId}">
            <div class="code-header-tabs">
              <span class="code-lang-label">${cleanLang || 'code'}</span>
              <div class="code-actions-group">
                <button class="code-action-btn" onclick="copyCode(this, '${blockId}')" title="Copy Code">
                  <i data-lucide="copy" style="width:14px;height:14px;"></i>
                </button>
                <button class="code-action-btn" onclick="downloadCode('${blockId}', '${cleanLang}')" title="Download Code">
                  <i data-lucide="download" style="width:14px;height:14px;"></i>
                </button>
              </div>
            </div>
            <div class="tab-content code-tab-content">
              <pre><code class="language-${cleanLang || 'txt'}">${escapeHtml(cleanCode)}</code></pre>
            </div>
          </div>
        `;
      }
      
      const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
      codeBlocks.push(blockHtml);
      return `\n\n${placeholder}\n\n`;
    });

    // 2. Escape HTML tags in non-code text to prevent rendering raw HTML tags
    processed = escapeHtml(processed);

    // 3. Format inline code: `code`
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4. Bold: **text**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Italic: *text*
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Split into paragraphs and replace internal newlines with <br>
    const paragraphs = processed.split(/\n\n+/);
    let finalHtml = paragraphs.map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('__CODE_BLOCK_PLACEHOLDER_') && trimmed.endsWith('__')) {
        return trimmed;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // 7. Restore code blocks into their respective placeholders
    codeBlocks.forEach((blockHtml, index) => {
      finalHtml = finalHtml.replace(`__CODE_BLOCK_PLACEHOLDER_${index}__`, blockHtml);
    });

    return finalHtml;
  }

  // Define Copy Code globally
  window.copyCode = function(button, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const codeElement = container.querySelector('code');
    if (!codeElement) return;

    const textToCopy = codeElement.textContent;

    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHtml = button.innerHTML;
      button.innerHTML = '<i data-lucide="check" style="width:14px;height:14px;"></i>';
      lucide.createIcons();
      
      setTimeout(() => {
        button.innerHTML = originalHtml;
        lucide.createIcons();
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy code:', err);
    });
  };

  // Define Download Code globally
  window.downloadCode = function(containerId, lang) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const codeElement = container.querySelector('code');
    if (!codeElement) return;

    const codeText = codeElement.textContent;
    
    let ext = 'txt';
    let baseName = 'code';
    const cleanLang = lang ? lang.toLowerCase().trim() : '';
    
    if (cleanLang === 'html') {
      ext = 'html';
      baseName = 'index';
    } else if (cleanLang === 'css') {
      ext = 'css';
      baseName = 'style';
    } else if (cleanLang === 'js' || cleanLang === 'javascript') {
      ext = 'js';
      baseName = 'script';
    } else if (cleanLang === 'ts' || cleanLang === 'typescript') {
      ext = 'ts';
      baseName = 'script';
    } else if (cleanLang === 'json') {
      ext = 'json';
      baseName = 'data';
    } else if (cleanLang === 'py' || cleanLang === 'python') {
      ext = 'py';
      baseName = 'main';
    } else if (cleanLang === 'svg') {
      ext = 'svg';
      baseName = 'vector';
    } else if (cleanLang === 'xml') {
      ext = 'xml';
      baseName = 'data';
    } else if (cleanLang === 'cpp' || cleanLang === 'c++') {
      ext = 'cpp';
      baseName = 'main';
    } else if (cleanLang === 'c') {
      ext = 'c';
      baseName = 'main';
    } else if (cleanLang === 'cs' || cleanLang === 'csharp') {
      ext = 'cs';
      baseName = 'Program';
    } else if (cleanLang === 'java') {
      ext = 'java';
      baseName = 'Main';
    } else if (cleanLang === 'sh' || cleanLang === 'bash') {
      ext = 'sh';
      baseName = 'script';
    } else if (cleanLang === 'sql') {
      ext = 'sql';
      baseName = 'query';
    } else if (cleanLang === 'md' || cleanLang === 'markdown') {
      ext = 'md';
      baseName = 'README';
    } else if (cleanLang === 'php') {
      ext = 'php';
      baseName = 'index';
    } else if (cleanLang === 'rb' || cleanLang === 'ruby') {
      ext = 'rb';
      baseName = 'main';
    } else if (cleanLang === 'rs' || cleanLang === 'rust') {
      ext = 'rs';
      baseName = 'main';
    } else if (cleanLang === 'go') {
      ext = 'go';
      baseName = 'main';
    } else if (cleanLang) {
      ext = cleanLang;
    }
    
    const fileName = `${baseName}.${ext}`;
    
    // Create a data URI with octet-stream to guarantee browser respects the filename
    const dataUrl = 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(codeText);
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
  };

  // Define right side preview globally
  window.openRightPreview = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const previewPanel = document.getElementById('preview-panel');
    const iframe = document.getElementById('right-preview-iframe');
    const previewTitleText = document.getElementById('preview-title-text');
    if (!previewPanel || !iframe) return;

    // Populate iframe content
    const codeElement = container.querySelector('code');
    // Decode HTML entities
    let rawCode = codeElement.innerHTML
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");

    const cleanLang = codeElement.className.replace('language-', '').trim();
    const isSvg = cleanLang.includes('svg') || cleanLang.includes('xml') || rawCode.trim().startsWith('<svg');
    const isCss = cleanLang.includes('css');
    const isJs = cleanLang.includes('js') || cleanLang.includes('javascript');
    
    let docContent = '';
    if (isSvg) {
      previewTitleText.textContent = 'SVG Vector Preview';
      docContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f172a; color: #fff; font-family: sans-serif; overflow: hidden; }
            svg { max-width: 90vw; max-height: 90vh; }
          </style>
        </head>
        <body>${rawCode}</body>
        </html>
      `;
    } else if (isCss) {
      previewTitleText.textContent = 'CSS Stylesheet Preview';
      docContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            ${rawCode}
          </style>
        </head>
        <body>
          <h3>CSS Styling Applied</h3>
          <p>Your styles are active in this viewport.</p>
          <button class="btn">Primary Button</button>
          <div class="card">Card Component</div>
        </body>
        </html>
      `;
    } else if (isJs) {
      previewTitleText.textContent = 'JavaScript Output';
      docContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f8fafc; color: #0f172a; }
            #console-log { background: #1e293b; color: #38bdf8; padding: 15px; border-radius: 8px; font-family: monospace; min-height: 120px; margin-top: 15px; white-space: pre-wrap; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <h3>JavaScript Runner Output</h3>
          <p>Captured console logs:</p>
          <div id="console-log"></div>
          <script>
            const logDiv = document.getElementById('console-log');
            const originalLog = console.log;
            console.log = function(...args) {
              logDiv.innerText += args.join(' ') + '\\n';
              originalLog.apply(console, args);
            };
            try {
              ${rawCode}
            } catch(e) {
              logDiv.innerText += 'Runtime Error: ' + e.message;
            }
          </script>
        </body>
        </html>
      `;
    } else {
      previewTitleText.textContent = 'Web Page Preview';
      docContent = rawCode;
    }

    iframe.srcdoc = docContent;
    
    // Open panel
    previewPanel.classList.remove('collapsed');
    
    // Update Lucide Icons
    lucide.createIcons();
  };

  // --- Auth & Quota functions ---
  function updateQuotaUI(used, limit) {
    const percentage = Math.min(100, Math.round((used / limit) * 100));
    quotaPercentage.textContent = `${percentage}%`;
    quotaProgressIndicator.style.width = `${percentage}%`;
    quotaUsedDisplay.textContent = used.toLocaleString();
    quotaLimitDisplay.textContent = `/ ${limit.toLocaleString()}`;
    
    // Change progress bar color based on percentage
    if (percentage > 90) {
      quotaProgressIndicator.style.background = 'var(--accent-red)';
    } else if (percentage > 70) {
      quotaProgressIndicator.style.background = 'var(--accent-orange)';
    } else {
      quotaProgressIndicator.style.background = 'linear-gradient(to right, var(--accent-indigo), var(--accent-pink))';
    }
  }

  async function checkUserStats() {
    if (!currentUser) return;
    try {
      const response = await fetch(`/api/user-stats?loginId=${currentUser.loginId}`);
      if (response.ok) {
        const stats = await response.json();
        updateQuotaUI(stats.tokensUsed, stats.tokensLimit);
      }
    } catch (e) {
      console.error('Error fetching user stats:', e);
    }
  }

  function handleLoginSuccess(user, stats) {
    currentUser = user;
    localStorage.setItem('kilo_user', JSON.stringify(user));
    
    // Populate UI
    userNameDisplay.textContent = user.name;
    userTierDisplay.textContent = user.userType;
    updateQuotaUI(stats.tokensUsed, stats.tokensLimit);

    // Show/hide Upgrade button based on Free Tier status
    const upgradeTierBtn = document.getElementById('upgrade-tier-btn');
    if (upgradeTierBtn) {
      if (user.userType === 'Free') {
        upgradeTierBtn.classList.remove('hidden');
      } else {
        upgradeTierBtn.classList.add('hidden');
      }
    }
    
    // Set profile avatar letter
    if (mobileProfileBtn && user.name) {
      const letterSpan = mobileProfileBtn.querySelector('.avatar-letter');
      if (letterSpan) letterSpan.textContent = user.name.charAt(0).toUpperCase();
    }
    
    // Toggle Visibility
    loginOverlay.classList.add('hidden');
    userCard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    if (loginTriggerBtn) loginTriggerBtn.classList.add('hidden');
    
    // Restore layout icons
    lucide.createIcons();

    // Load chat history from Google Sheets
    loadHistoryFromServer();

    // Refresh model list for the signed-in user
    fetchModelsList(true);
  }

  function resetLoginForm() {
    isOtpPhase = false;
    registeringEmail = '';
    registeringName = '';
    selectedPlanTier = '';
    loginInput.value = '';
    if (otpInput) {
      otpInput.value = '';
      otpInput.required = false;
    }
    if (loginEmailGroup) loginEmailGroup.classList.remove('hidden');
    if (loginOtpGroup) loginOtpGroup.classList.add('hidden');
    if (loginSubmitBtn) {
      loginSubmitBtn.classList.remove('loading');
      loginSubmitBtn.innerHTML = '<i data-lucide="log-in"></i> Sign In / Register';
      lucide.createIcons();
    }
    loginError.classList.add('hidden');

    if (qrTimerInterval) {
      clearInterval(qrTimerInterval);
      qrTimerInterval = null;
    }

    // Reset tabs selection
    const tabCard = document.getElementById('tab-card');
    if (tabCard) tabCard.click();

    // Reset registration step display
    const regContainer = document.getElementById('registration-tier-container');
    const loginFormEl = document.getElementById('login-form');
    const checkoutContainer = document.getElementById('checkout-container');
    if (regContainer) regContainer.classList.add('hidden');
    if (loginFormEl) loginFormEl.classList.remove('hidden');
    if (checkoutContainer) checkoutContainer.classList.add('hidden');
    document.getElementById('login-overlay').classList.remove('registration-phase');

    // Clear checkout inputs
    const cardName = document.getElementById('card-name');
    const cardNumber = document.getElementById('card-number');
    const cardExpiry = document.getElementById('card-expiry');
    const cardCvv = document.getElementById('card-cvv');
    if (cardName) cardName.value = '';
    if (cardNumber) cardNumber.value = '';
    if (cardExpiry) cardExpiry.value = '';
    if (cardCvv) cardCvv.value = '';
  }

  async function attemptLogin(loginIdOrEmail) {
    loginError.classList.add('hidden');
    
    // Enforce valid email addresses
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i;
    if (!emailRegex.test(loginIdOrEmail)) {
      loginError.textContent = "Please enter a valid email address.";
      loginError.classList.remove('hidden');
      return;
    }

    if (loginSubmitBtn) loginSubmitBtn.classList.add('loading');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginIdOrEmail })
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server returned HTML error (Offline or Crash). Status: ${response.status}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      if (data.otpRequired) {
        // Switch to OTP Verification Phase
        isOtpPhase = true;
        loginEmailGroup.classList.add('hidden');
        loginOtpGroup.classList.remove('hidden');
        loginSubmitBtn.innerHTML = '<i data-lucide="shield-check"></i> Verify OTP & Register';
        lucide.createIcons();
        otpInput.focus();
        otpInput.required = true;
      } else {
        // Existing user logs in directly
        handleLoginSuccess(data.user, data.stats);
        resetLoginForm();
      }
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.classList.remove('loading');
    }
  }

  async function handleGoogleLogin(email, name) {
    loginError.classList.add('hidden');
    if (loginSubmitBtn) loginSubmitBtn.classList.add('loading');

    try {
      const response = await fetch('/api/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server returned HTML error. Status: ${response.status}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Google login failed');
      }
      
      if (data.isNewUser) {
        // Show plan selection screen
        registeringEmail = data.email;
        registeringName = data.name || '';
        document.getElementById('registering-email-display').textContent = data.email;
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('registration-tier-container').classList.remove('hidden');
        document.getElementById('login-overlay').classList.add('registration-phase');
        lucide.createIcons();
      } else {
        // Successfully authenticated!
        handleLoginSuccess(data.user, data.stats);
        resetLoginForm();
      }
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
      loginOverlay.classList.remove('hidden');
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.classList.remove('loading');
    }
  }

  async function initGoogleSignIn() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to load config');
      const config = await res.json();
      
      const btnContainer = document.getElementById('google-login-btn-container');
      const warningEl = document.getElementById('google-config-warning');
      
      if (!config.googleClientId) {
        if (warningEl) warningEl.classList.remove('hidden');
        if (btnContainer) {
          btnContainer.innerHTML = `
            <button type="button" class="google-btn" style="opacity: 0.6; cursor: not-allowed;" disabled>
              <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;margin-right:8px;vertical-align:middle;">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
              </svg>
              Google Sign-In Unconfigured
            </button>
          `;
        }
        return;
      }
      
      if (warningEl) warningEl.classList.add('hidden');
      
      const checkGoogleLib = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          clearInterval(checkGoogleLib);
          
          window.google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: window.handleGoogleCredentialResponse,
            context: 'signin',
            ux_mode: 'popup'
          });
          
          window.google.accounts.id.renderButton(
            btnContainer,
            { 
              type: 'standard',
              theme: 'outline', 
              size: 'large', 
              text: 'signin_with',
              shape: 'rectangular',
              width: btnContainer.clientWidth || 300
            }
          );
        }
      }, 100);
    } catch (e) {
      console.error('Failed to initialize official Google Sign-In:', e);
    }
  }

  window.handleGoogleCredentialResponse = async function(response) {
    if (!response || !response.credential) {
      loginError.textContent = "Google authentication failed. Please try again.";
      loginError.classList.remove('hidden');
      return;
    }
    
    try {
      const token = response.credential;
      const payload = decodeJwt(token);
      const email = payload.email;
      const name = payload.name || payload.given_name || email.split('@')[0];
      
      await handleGoogleLogin(email, name);
    } catch (err) {
      loginError.textContent = "Failed to parse Google account credentials: " + err.message;
      loginError.classList.remove('hidden');
    }
  };

  function decodeJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      throw new Error("Invalid JWT token structure");
    }
  }

  async function verifyOtp(email, otp) {
    loginError.classList.add('hidden');
    
    if (!otp || otp.length !== 6) {
      loginError.textContent = "Please enter a valid 6-digit OTP code.";
      loginError.classList.remove('hidden');
      return;
    }

    if (loginSubmitBtn) loginSubmitBtn.classList.add('loading');

    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server returned HTML error (Offline or Crash). Status: ${response.status}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }
      
      if (data.isNewUser) {
        // Show plan selection screen
        registeringEmail = data.email;
        registeringName = data.name || '';
        document.getElementById('registering-email-display').textContent = data.email;
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('registration-tier-container').classList.remove('hidden');
        document.getElementById('login-overlay').classList.add('registration-phase');
        lucide.createIcons();
      } else {
        // Successfully verified & registered!
        handleLoginSuccess(data.user, data.stats);
        resetLoginForm();
      }
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    } finally {
      if (loginSubmitBtn) loginSubmitBtn.classList.remove('loading');
    }
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem('kilo_user');
    localStorage.removeItem('kilo_chat_history');
    localStorage.removeItem('kilo_guest_count');
    window.location.reload();
  }

  // ===== Chat History Management =====

  function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function getChatTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const text = firstUserMsg.content;
      return text.length > 40 ? text.substring(0, 40) + '...' : text;
    }
    return 'New Conversation';
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  function saveCurrentChat() {
    if (chatMessages.length === 0) return;

    if (!currentChatId) {
      currentChatId = generateChatId();
    }

    const chatEntry = {
      id: currentChatId,
      title: getChatTitle(chatMessages),
      messages: [...chatMessages],
      updatedAt: Date.now()
    };

    const existingIdx = chatHistory.findIndex(c => c.id === currentChatId);
    if (existingIdx >= 0) {
      chatHistory[existingIdx] = chatEntry;
    } else {
      chatHistory.unshift(chatEntry);
    }

    // Sort latest first
    chatHistory.sort((a, b) => b.updatedAt - a.updatedAt);
    renderHistory();
    persistLocalHistory();

    // Save to Google Sheets if logged in
    if (currentUser && currentUser.email) {
      fetch('/api/save-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          chatId: chatEntry.id,
          title: chatEntry.title,
          messages: chatEntry.messages,
          updatedAt: chatEntry.updatedAt
        })
      }).catch(err => console.error('Error saving chat to cloud:', err));
    }
  }

  async function loadHistoryFromServer() {
    if (!currentUser || !currentUser.email) {
      chatHistory = [];
      renderHistory();
      return;
    }

    try {
      const response = await fetch(`/api/load-history?email=${encodeURIComponent(currentUser.email)}&t=${Date.now()}`);
      const data = await response.json();
      
      if (response.ok && data.success && data.history) {
        const cloudHistory = data.history.map(chat => {
          try {
            return {
              ...chat,
              messages: typeof chat.messages === 'string' ? JSON.parse(chat.messages) : chat.messages
            };
          } catch (parseErr) {
            console.warn('Skipping corrupted chat history entry:', chat.id, parseErr);
            return null;
          }
        }).filter(Boolean);

        const cloudIds = new Set(cloudHistory.map(c => c.id));
        const localOnly = chatHistory.filter(c => !cloudIds.has(c.id));
        chatHistory = [...cloudHistory, ...localOnly];
        chatHistory.sort((a, b) => b.updatedAt - a.updatedAt);
      } else {
        console.warn('Could not load cloud history:', data.error || 'Server returned no history');
      }
      renderHistory();
    } catch (err) {
      console.error('Error loading history from server:', err);
      renderHistory();
    }
  }

  function renderHistory() {
    if (!historyList) return;

    // Clear existing items (except the empty placeholder)
    const items = historyList.querySelectorAll('.history-item');
    items.forEach(item => item.remove());

    if (chatHistory.length === 0) {
      if (historyEmpty) historyEmpty.style.display = 'flex';
      return;
    }

    if (historyEmpty) historyEmpty.style.display = 'none';

    chatHistory.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'history-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <i data-lucide="message-square" class="history-item-icon"></i>
        <div class="history-item-text">
          <div class="history-item-title">${escapeHtml(chat.title)}</div>
          <div class="history-item-date">${formatDate(chat.updatedAt)}</div>
        </div>
        <button class="history-item-delete" title="Delete conversation">
          <i data-lucide="trash-2"></i>
        </button>
      `;

      // Click to load conversation
      item.addEventListener('click', (e) => {
        if (e.target.closest('.history-item-delete')) return;
        loadChat(chat.id);
      });

      // Delete button
      const deleteBtn = item.querySelector('.history-item-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });

      historyList.appendChild(item);
    });

    lucide.createIcons();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function loadChat(chatId) {
    if (isGenerating) return;

    saveCurrentChat();

    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;

    currentChatId = chat.id;
    chatMessages = [...chat.messages];

    const allBubbles = chatFeed.querySelectorAll('.message');
    allBubbles.forEach(b => b.remove());

    const wc = document.getElementById('welcome-container');
    if (wc) wc.remove();

    chatMessages.forEach(msg => {
      appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
    });

    sessionStats.textContent = `${chatMessages.length} messages`;
    renderHistory();
  }

  function deleteChat(chatId) {
    chatHistory = chatHistory.filter(c => c.id !== chatId);
    persistLocalHistory();

    // Delete from Google Sheets if logged in
    if (currentUser && currentUser.email) {
      fetch('/api/delete-chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email, chatId })
      }).catch(err => console.error('Error deleting chat from cloud:', err));
    }

    // If deleting the active chat, start a new one
    if (chatId === currentChatId) {
      currentChatId = null;
      chatMessages = [];
      const allBubbles = chatFeed.querySelectorAll('.message');
      allBubbles.forEach(b => b.remove());
      sessionStats.textContent = '0 messages';
      
      let wc = document.getElementById('welcome-container');
      if (!wc) {
        wc = createWelcomeElement();
        chatFeed.appendChild(wc);
      }
    }

    renderHistory();
  }

  function startNewChat() {
    if (isGenerating) return;

    saveCurrentChat();

    currentChatId = null;
    chatMessages = [];

    const allBubbles = chatFeed.querySelectorAll('.message');
    allBubbles.forEach(b => b.remove());
    sessionStats.textContent = '0 messages';

    let wc = document.getElementById('welcome-container');
    if (!wc) {
      wc = createWelcomeElement();
      chatFeed.appendChild(wc);
    }

    persistLocalHistory();
    renderHistory();
    chatInput.focus();
  }

  // Initialize: load history from server if user is logged in
  if (currentUser && currentUser.email) {
    loadHistoryFromServer();
  } else {
    renderHistory();
  }

  // Dynamic Responsive Input Bar Layout Manager
  const headerCenter = document.querySelector('.header-center');
  const inputActionsRight = document.querySelector('.input-actions-right');
  const modelSelectWrapper = document.querySelector('.header-model-select');
  
  function handleLayoutChange() {
    if (window.innerWidth > 850) {
      if (inputActionsRight && modelSelectWrapper && !inputActionsRight.contains(modelSelectWrapper)) {
        inputActionsRight.insertBefore(modelSelectWrapper, inputActionsRight.firstChild);
      }
    } else {
      if (headerCenter && modelSelectWrapper && !headerCenter.contains(modelSelectWrapper)) {
        headerCenter.appendChild(modelSelectWrapper);
      }
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
  
  window.addEventListener('resize', handleLayoutChange);
  handleLayoutChange();
});
