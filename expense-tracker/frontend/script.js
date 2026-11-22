/**
 * ============================================================================
 * Personal Expense Tracker - Frontend Logic (Vanilla JavaScript)
 * AWS Services: Amazon S3, Amazon API Gateway, AWS Lambda, Amazon DynamoDB, Amazon Cognito
 * ============================================================================
 */

// ============================================================================
// 1. CONFIGURATION
// Replace the placeholders below after completing AWS setup.
// If left empty, the application runs smoothly in Local Demo Mode!
// ============================================================================
const AWS_CONFIG = {
  // Amazon API Gateway Invoke URL
  apiBaseUrl: "https://3v4p2ugf99.execute-api.ap-southeast-2.amazonaws.com/prod",

  // Amazon Cognito User Pool configuration
  cognito: {
    region: "ap-southeast-2",
    userPoolId: "ap-southeast-2_X0a0AkHFh",
    clientId: "7u53m9mnp5d0cfntuna4lo5fq4"
  }
};

// ============================================================================
// 2. STATE MANAGEMENT
// ============================================================================
const state = {
  user: null,          // { email, idToken, userId }
  expenses: [],        // Array of expense items
  isDemoMode: false    // True if AWS credentials not supplied or Guest Mode selected
};

// Local storage keys
const STORAGE_KEYS = {
  AUTH: "expense_tracker_auth",
  LOCAL_EXPENSES: "expense_tracker_local_items"
};

// ============================================================================
// 3. INITIALIZATION & DOM ELEMENTS
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // Set default date in Add Expense form to today
  const dateInput = document.getElementById("expense-date");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }

  // Check stored auth session
  restoreSession();

  // Setup event listeners
  setupNavigationEvents();
  setupFormEvents();
  setupAuthEvents();

  // Initial load
  refreshExpensesList();
}

// ============================================================================
// 4. NAVIGATION & TAB SWITCHING
// ============================================================================
function setupNavigationEvents() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-target");
      switchTab(targetId);
    });
  });

  const viewAllBtn = document.getElementById("view-all-btn");
  if (viewAllBtn) {
    viewAllBtn.addEventListener("click", () => {
      switchTab("history-section");
    });
  }

  const notificationClose = document.getElementById("notification-close");
  if (notificationClose) {
    notificationClose.addEventListener("click", () => {
      hideNotification();
    });
  }
}

function switchTab(sectionId) {
  // Update nav tab buttons
  document.querySelectorAll(".nav-tab").forEach(tab => {
    if (tab.getAttribute("data-target") === sectionId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Switch visible section
  document.querySelectorAll(".app-section").forEach(sec => {
    sec.classList.remove("active");
  });

  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add("active");
  }
}

// ============================================================================
// 5. SESSION & AWS MODE DETECTION
// ============================================================================
function restoreSession() {
  const isAwsConfigured = Boolean(
    AWS_CONFIG.apiBaseUrl && 
    AWS_CONFIG.cognito.clientId && 
    AWS_CONFIG.cognito.userPoolId
  );

  const savedAuth = localStorage.getItem(STORAGE_KEYS.AUTH);
  if (savedAuth) {
    try {
      state.user = JSON.parse(savedAuth);
    } catch (e) {
      state.user = null;
    }
  }

  if (!isAwsConfigured) {
    // Automatically use Local Demo Mode if AWS isn't configured yet
    state.isDemoMode = true;
    if (!state.user) {
      state.user = { email: "student@demo.local", userId: "demo-user-123", idToken: "demo-token" };
    }
    updateModeBanner(
      "Local Demo Mode",
      "Running locally via browser storage. Add your AWS API Gateway URL in script.js to connect live cloud backend."
    );
  } else {
    state.isDemoMode = false;
    updateModeBanner(
      "AWS Cloud Connected",
      `API Gateway: ${AWS_CONFIG.apiBaseUrl}`
    );
  }

  updateUserDisplay();
}

function updateModeBanner(badgeText, messageText) {
  const badge = document.getElementById("mode-badge");
  const text = document.getElementById("mode-text");
  if (badge) badge.textContent = badgeText;
  if (text) text.textContent = messageText;
}

function updateUserDisplay() {
  const userDisplay = document.getElementById("user-display");
  const authActionBtn = document.getElementById("auth-action-btn");

  if (state.user && state.user.email) {
    userDisplay.textContent = state.user.email;
    authActionBtn.textContent = "Sign Out";
  } else {
    userDisplay.textContent = "Guest";
    authActionBtn.textContent = "Sign In";
  }
}

// ============================================================================
// 6. EXPENSE API (FETCH & LOCAL FALLBACK)
// ============================================================================

/**
 * Fetch all expenses for the current user
 */
async function fetchExpenses() {
  if (state.isDemoMode) {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_EXPENSES);
    if (!raw) {
      // Seed initial sample expenses for college demonstration
      const sample = [
        {
          expenseId: "exp_sample_1",
          title: "College Textbooks & Notebooks",
          amount: 850,
          category: "Education",
          date: new Date().toISOString().split("T")[0]
        },
        {
          expenseId: "exp_sample_2",
          title: "Campus Cafeteria Lunch",
          amount: 140,
          category: "Food",
          date: new Date().toISOString().split("T")[0]
        },
        {
          expenseId: "exp_sample_3",
          title: "Metro Smart Card Recharge",
          amount: 300,
          category: "Travel",
          date: new Date(Date.now() - 86400000 * 2).toISOString().split("T")[0]
        }
      ];
      localStorage.setItem(STORAGE_KEYS.LOCAL_EXPENSES, JSON.stringify(sample));
      return sample;
    }
    return JSON.parse(raw);
  }

  // AWS Cloud Mode: GET /expenses from API Gateway
  const token = state.user?.idToken;
  if (!token) {
    showNotification("Please sign in to view your expenses.", "error");
    return [];
  }

  const response = await fetch(`${AWS_CONFIG.apiBaseUrl}/expenses`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch expenses (Status ${response.status})`);
  }

  const data = await response.json();
  return data.expenses || [];
}

/**
 * Add a new expense via POST
 */
async function apiAddExpense(expenseData) {
  if (state.isDemoMode) {
    const expenses = await fetchExpenses();
    const newExpense = {
      expenseId: "exp_" + Date.now(),
      ...expenseData
    };
    expenses.unshift(newExpense);
    localStorage.setItem(STORAGE_KEYS.LOCAL_EXPENSES, JSON.stringify(expenses));
    return newExpense;
  }

  // AWS Cloud Mode: POST /expenses to API Gateway
  const token = state.user?.idToken;
  if (!token) throw new Error("Authentication required. Please sign in.");

  const response = await fetch(`${AWS_CONFIG.apiBaseUrl}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(expenseData)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to add expense");
  }

  const data = await response.json();
  return data.expense;
}

/**
 * Delete an expense via DELETE
 */
async function apiDeleteExpense(expenseId) {
  if (state.isDemoMode) {
    let expenses = await fetchExpenses();
    expenses = expenses.filter(item => item.expenseId !== expenseId);
    localStorage.setItem(STORAGE_KEYS.LOCAL_EXPENSES, JSON.stringify(expenses));
    return true;
  }

  // AWS Cloud Mode: DELETE /expenses/{id}
  const token = state.user?.idToken;
  if (!token) throw new Error("Authentication required. Please sign in.");

  const response = await fetch(`${AWS_CONFIG.apiBaseUrl}/expenses/${expenseId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to delete expense");
  }

  return true;
}

// ============================================================================
// 7. UI RENDERING & REFRESH LOGIC
// ============================================================================
async function refreshExpensesList() {
  try {
    state.expenses = await fetchExpenses();
    // Sort descending by date
    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    renderDashboardStats();
    renderRecentExpenses();
    renderHistoryTable();
  } catch (error) {
    console.error("Error refreshing expenses:", error);
    showNotification(error.message, "error");
  }
}

function renderDashboardStats() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  let monthTotal = 0;
  let allTimeTotal = 0;
  const transactionCount = state.expenses.length;

  state.expenses.forEach(item => {
    const amount = Number(item.amount) || 0;
    allTimeTotal += amount;

    if (item.date) {
      const expDate = new Date(item.date);
      if (expDate.getFullYear() === currentYear && expDate.getMonth() === currentMonth) {
        monthTotal += amount;
      }
    }
  });

  // Update elements
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  
  document.getElementById("stat-month-total").textContent = formatRupee(monthTotal);
  document.getElementById("stat-month-name").textContent = `${monthNames[currentMonth]} ${currentYear}`;
  document.getElementById("stat-transaction-count").textContent = transactionCount;
  document.getElementById("stat-alltime-total").textContent = formatRupee(allTimeTotal);
}

function renderRecentExpenses() {
  const container = document.getElementById("recent-expenses-list");
  if (!container) return;

  const recents = state.expenses.slice(0, 5); // Take first 5 items

  if (recents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No recent expenses recorded yet. Click <strong>Add Expense</strong> to start!
      </div>
    `;
    return;
  }

  container.innerHTML = recents.map(item => `
    <div class="recent-item">
      <div class="recent-item-left">
        <span class="recent-item-title">${escapeHtml(item.title)}</span>
        <div class="recent-item-meta">
          <span>${formatDate(item.date)}</span>
          <span class="category-badge cat-${item.category || 'Other'}">${item.category || 'Other'}</span>
        </div>
      </div>
      <div class="recent-item-amount">${formatRupee(item.amount)}</div>
    </div>
  `).join("");
}

function renderHistoryTable() {
  const tbody = document.getElementById("history-table-body");
  if (!tbody) return;

  if (state.expenses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          No expenses recorded yet. Switch to the <strong>Add Expense</strong> tab to record your first entry.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.expenses.map(item => `
    <tr>
      <td>${formatDate(item.date)}</td>
      <td><strong>${escapeHtml(item.title)}</strong></td>
      <td>
        <span class="category-badge cat-${item.category || 'Other'}">
          ${item.category || 'Other'}
        </span>
      </td>
      <td class="text-right table-amount">${formatRupee(item.amount)}</td>
      <td class="text-center">
        <button class="btn btn-danger" onclick="handleDeleteExpense('${item.expenseId}')">
          Delete
        </button>
      </td>
    </tr>
  `).join("");
}

// Global delete handler attached to window
window.handleDeleteExpense = async function(expenseId) {
  if (!confirm("Are you sure you want to delete this expense?")) {
    return;
  }

  try {
    await apiDeleteExpense(expenseId);
    showNotification("Expense deleted successfully", "success");
    await refreshExpensesList();
  } catch (error) {
    showNotification(error.message, "error");
  }
};

// ============================================================================
// 8. ADD EXPENSE FORM HANDLER
// ============================================================================
function setupFormEvents() {
  const form = document.getElementById("add-expense-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const titleInput = document.getElementById("expense-title");
    const amountInput = document.getElementById("expense-amount");
    const categorySelect = document.getElementById("expense-category");
    const dateInput = document.getElementById("expense-date");
    const submitBtn = document.getElementById("btn-submit-expense");

    const title = titleInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const category = categorySelect.value;
    const date = dateInput.value;

    // Basic Input Validation
    if (!title) {
      showNotification("Please enter an expense title.", "error");
      titleInput.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      showNotification("Please enter a valid amount greater than 0.", "error");
      amountInput.focus();
      return;
    }

    if (!category) {
      showNotification("Please select a category.", "error");
      categorySelect.focus();
      return;
    }

    if (!date) {
      showNotification("Please select a valid date.", "error");
      dateInput.focus();
      return;
    }

    const payload = { title, amount, category, date };

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      await apiAddExpense(payload);
      showNotification("Expense added successfully!", "success");

      // Reset form and set date to today
      form.reset();
      dateInput.value = new Date().toISOString().split("T")[0];

      // Refresh data and switch to Dashboard view
      await refreshExpensesList();
      switchTab("dashboard-section");

    } catch (error) {
      showNotification(error.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add Expense";
    }
  });
}

// ============================================================================
// 9. COGNITO AUTHENTICATION (PURE VANILLA JS VIA COGNITO IDP JSON API)
// ============================================================================
function setupAuthEvents() {
  const authActionBtn = document.getElementById("auth-action-btn");
  const authModal = document.getElementById("auth-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const tabConfirm = document.getElementById("tab-confirm");

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const confirmForm = document.getElementById("confirm-form");
  const modalTitle = document.getElementById("modal-title");

  const btnGuestMode = document.getElementById("btn-guest-mode");

  // Sign In / Sign Out button click
  authActionBtn.addEventListener("click", () => {
    if (state.user && !state.isDemoMode) {
      // User is logged in with AWS Cognito -> Sign Out
      state.user = null;
      localStorage.removeItem(STORAGE_KEYS.AUTH);
      updateUserDisplay();
      showNotification("Signed out successfully.", "success");
      refreshExpensesList();
    } else {
      // Open Auth Modal
      authModal.style.display = "flex";
    }
  });

  modalCloseBtn.addEventListener("click", () => {
    authModal.style.display = "none";
  });

  // Modal Tabs
  tabLogin.addEventListener("click", () => {
    showAuthTab("login");
  });

  tabRegister.addEventListener("click", () => {
    showAuthTab("register");
  });

  function showAuthTab(tab) {
    tabLogin.classList.toggle("active", tab === "login");
    tabRegister.classList.toggle("active", tab === "register");
    tabConfirm.classList.toggle("active", tab === "confirm");

    loginForm.style.display = tab === "login" ? "block" : "none";
    registerForm.style.display = tab === "register" ? "block" : "none";
    confirmForm.style.display = tab === "confirm" ? "block" : "none";

    if (tab === "login") modalTitle.textContent = "Sign In";
    if (tab === "register") modalTitle.textContent = "Create Account";
    if (tab === "confirm") modalTitle.textContent = "Verify Account";
  }

  // Guest Mode Button
  btnGuestMode.addEventListener("click", () => {
    state.isDemoMode = true;
    state.user = { email: "student@demo.local", userId: "demo-user-123", idToken: "demo-token" };
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(state.user));
    authModal.style.display = "none";
    updateUserDisplay();
    updateModeBanner("Local Demo Mode", "Active in local test mode.");
    showNotification("Switched to Local Demo Mode.", "success");
    refreshExpensesList();
  });

  // Register Form Submit
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const btn = document.getElementById("btn-register-submit");

    if (!AWS_CONFIG.cognito.clientId) {
      showNotification("Cognito Client ID is not configured in script.js.", "error");
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Creating...";

      await cognitoSignUp(email, password);
      showNotification("Registration successful! Check your email for the verification code.", "success");

      // Switch to confirmation form
      document.getElementById("confirm-email").value = email;
      tabConfirm.style.display = "inline-block";
      showAuthTab("confirm");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  });

  // Confirm Verification Code Form Submit
  confirmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("confirm-email").value.trim();
    const code = document.getElementById("confirm-code").value.trim();
    const btn = document.getElementById("btn-confirm-submit");

    try {
      btn.disabled = true;
      btn.textContent = "Verifying...";

      await cognitoConfirmSignUp(email, code);
      showNotification("Account verified! You can now sign in.", "success");

      // Switch back to login
      document.getElementById("login-email").value = email;
      showAuthTab("login");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm Account";
    }
  });

  // Login Form Submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-login-submit");

    if (!AWS_CONFIG.cognito.clientId) {
      showNotification("Cognito Client ID is not configured in script.js. Use Guest Mode to test locally.", "error");
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Signing In...";

      const authResult = await cognitoInitiateAuth(email, password);
      const idToken = authResult.IdToken;
      const parsedToken = parseJwt(idToken);

      state.user = {
        email: parsedToken.email || email,
        userId: parsedToken.sub,
        idToken: idToken
      };
      state.isDemoMode = false;

      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(state.user));
      authModal.style.display = "none";
      updateUserDisplay();
      updateModeBanner("AWS Cloud Connected", `Authenticated as ${email}`);
      showNotification("Signed in successfully!", "success");

      await refreshExpensesList();
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });
}

/**
 * Direct AWS Cognito REST API Calls (No external libraries required)
 */
async function callCognito(target, payload) {
  const region = AWS_CONFIG.cognito.region || "ap-south-1";
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.__type || "Cognito error");
  }
  return data;
}

async function cognitoSignUp(email, password) {
  return await callCognito("SignUp", {
    ClientId: AWS_CONFIG.cognito.clientId,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email }
    ]
  });
}

async function cognitoConfirmSignUp(email, code) {
  return await callCognito("ConfirmSignUp", {
    ClientId: AWS_CONFIG.cognito.clientId,
    Username: email,
    ConfirmationCode: code
  });
}

async function cognitoInitiateAuth(email, password) {
  const result = await callCognito("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: AWS_CONFIG.cognito.clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  });
  return result.AuthenticationResult;
}

// ============================================================================
// 10. HELPER UTILITIES
// ============================================================================

/**
 * Formats a numeric value into Indian Rupee (₹) format
 */
function formatRupee(val) {
  const num = Number(val) || 0;
  return "₹" + num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formats YYYY-MM-DD to readable format (e.g., Nov 21, 2026)
 */
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }
  return dateStr;
}

/**
 * Decodes a JWT token without external libraries
 */
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return {};
  }
}

/**
 * Escapes HTML characters to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Displays floating notification banner
 */
function showNotification(message, type = "success") {
  const box = document.getElementById("notification-box");
  const msgEl = document.getElementById("notification-message");
  if (!box || !msgEl) return;

  msgEl.textContent = message;
  box.className = `notification-container ${type}`;
  box.style.display = "flex";

  // Auto-hide after 4 seconds
  clearTimeout(window._notifTimer);
  window._notifTimer = setTimeout(() => {
    hideNotification();
  }, 4000);
}

function hideNotification() {
  const box = document.getElementById("notification-box");
  if (box) box.style.display = "none";
}

