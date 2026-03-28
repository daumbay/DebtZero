// === State ===
let debts = JSON.parse(localStorage.getItem('debtzero_debts') || '[]');
let payments = JSON.parse(localStorage.getItem('debtzero_payments') || '[]');
let totalPaid = parseFloat(localStorage.getItem('debtzero_totalPaid') || '0');
let originalTotal = parseFloat(localStorage.getItem('debtzero_originalTotal') || '0');
let strategy = 'avalanche';

// === DOM Refs ===
const $ = (sel) => document.querySelector(sel);
const totalDebtEl = $('#total-debt');
const totalMonthlyEl = $('#total-monthly');
const debtCountEl = $('#debt-count');
const avgRateEl = $('#avg-rate');
const progressFill = $('#progress-fill');
const progressPct = $('#progress-pct');
const progressSub = $('#progress-sub');
const debtList = $('#debt-list');
const emptyState = $('#empty-state');
const debtForm = $('#debt-form');
const paymentForm = $('#payment-form');
const paymentDebtSelect = $('#payment-debt');
const paymentHistory = $('#payment-history');
const payoffOrder = $('#payoff-order');
const strategyInfo = $('#strategy-info');
const themeToggle = $('#theme-toggle');

// === Theme ===
const savedTheme = localStorage.getItem('debtzero_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('debtzero_theme', next);
});

// === Formatting ===
function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// === Save ===
function save() {
  localStorage.setItem('debtzero_debts', JSON.stringify(debts));
  localStorage.setItem('debtzero_payments', JSON.stringify(payments));
  localStorage.setItem('debtzero_totalPaid', totalPaid.toString());
  localStorage.setItem('debtzero_originalTotal', originalTotal.toString());
}

// === Render Everything ===
function render() {
  renderDashboard();
  renderDebtList();
  renderPaymentSelect();
  renderPaymentHistory();
  renderStrategy();
  renderProgress();
}

// === Dashboard ===
function renderDashboard() {
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const monthly = debts.reduce((s, d) => s + d.minimum, 0);
  const avgRate = debts.length ? debts.reduce((s, d) => s + d.rate, 0) / debts.length : 0;

  totalDebtEl.textContent = fmt(total);
  totalMonthlyEl.textContent = fmt(monthly);
  debtCountEl.textContent = debts.length;
  avgRateEl.textContent = avgRate.toFixed(1) + '%';
}

// === Progress ===
function renderProgress() {
  if (originalTotal <= 0) {
    progressFill.style.width = '0%';
    progressPct.textContent = '0%';
    progressSub.textContent = 'Add debts and log payments to track your progress.';
    return;
  }
  const pct = Math.min(100, (totalPaid / originalTotal) * 100);
  progressFill.style.width = pct.toFixed(1) + '%';
  progressPct.textContent = pct.toFixed(1) + '%';
  const remaining = debts.reduce((s, d) => s + d.balance, 0);
  progressSub.textContent = `${fmt(totalPaid)} paid of ${fmt(originalTotal)} — ${fmt(remaining)} remaining`;
}

// === Debt List ===
function renderDebtList() {
  if (debts.length === 0) {
    debtList.innerHTML = '<p class="empty-state">No debts added yet. Use the form above to get started!</p>';
    return;
  }

  const icons = ['💳', '🏠', '🎓', '🚗', '🏥', '📱', '🛒', '✈️'];
  debtList.innerHTML = debts.map((d, i) => `
    <div class="debt-item">
      <div class="debt-icon">${icons[i % icons.length]}</div>
      <div class="debt-info">
        <div class="debt-title">${escapeHtml(d.name)}</div>
        <div class="debt-meta">${d.rate}% APR &middot; ${fmt(d.minimum)}/mo min</div>
      </div>
      <div class="debt-balance">
        <div class="balance-amount">${fmt(d.balance)}</div>
        <div class="balance-original">of ${fmt(d.original)}</div>
      </div>
      <button class="btn-delete" data-index="${i}" title="Remove debt">&times;</button>
    </div>
  `).join('');

  debtList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      debts.splice(idx, 1);
      recalcOriginalTotal();
      save();
      render();
    });
  });
}

// === Payment Select ===
function renderPaymentSelect() {
  paymentDebtSelect.innerHTML = '<option value="">Select a debt</option>' +
    debts.map((d, i) => `<option value="${i}">${escapeHtml(d.name)} (${fmt(d.balance)})</option>`).join('');
}

// === Payment History ===
function renderPaymentHistory() {
  if (payments.length === 0) {
    paymentHistory.innerHTML = '';
    return;
  }
  const recent = payments.slice(-10).reverse();
  paymentHistory.innerHTML = recent.map(p => `
    <div class="payment-entry">
      <span class="pe-info">${escapeHtml(p.debtName)} &middot; ${p.date}</span>
      <span class="pe-amount">${fmt(p.amount)}</span>
    </div>
  `).join('');
}

// === Strategy ===
function renderStrategy() {
  if (debts.length === 0) {
    strategyInfo.textContent = 'Add debts to see your recommended payoff order.';
    payoffOrder.innerHTML = '';
    return;
  }

  const sorted = [...debts].sort((a, b) => {
    if (strategy === 'avalanche') return b.rate - a.rate;
    return a.balance - b.balance;
  });

  if (strategy === 'avalanche') {
    strategyInfo.textContent = 'Pay minimums on all debts, then throw extra money at the highest interest rate first. Saves the most money over time.';
  } else {
    strategyInfo.textContent = 'Pay minimums on all debts, then throw extra money at the smallest balance first. Builds momentum with quick wins.';
  }

  payoffOrder.innerHTML = sorted.map(d => `
    <li>
      <span class="po-name">${escapeHtml(d.name)}</span>
      <span class="po-detail">${fmt(d.balance)} @ ${d.rate}%</span>
    </li>
  `).join('');
}

// === Strategy Toggle ===
document.querySelectorAll('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    strategy = btn.dataset.strategy;
    renderStrategy();
  });
});

// === Add Debt ===
debtForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#debt-name').value.trim();
  const balance = parseFloat($('#debt-balance').value);
  const rate = parseFloat($('#debt-rate').value);
  const minimum = parseFloat($('#debt-minimum').value);

  if (!name || isNaN(balance) || isNaN(rate) || isNaN(minimum)) return;

  debts.push({ name, balance, rate, minimum, original: balance });
  originalTotal += balance;
  save();
  render();
  debtForm.reset();
});

// === Log Payment ===
paymentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const idx = parseInt(paymentDebtSelect.value);
  const amount = parseFloat($('#payment-amount').value);

  if (isNaN(idx) || isNaN(amount) || amount <= 0) return;

  const debt = debts[idx];
  const actual = Math.min(amount, debt.balance);
  debt.balance = Math.max(0, debt.balance - actual);
  totalPaid += actual;

  payments.push({
    debtName: debt.name,
    amount: actual,
    date: new Date().toLocaleDateString('en-US')
  });

  if (debt.balance <= 0) {
    debts.splice(idx, 1);
  }

  save();
  render();
  paymentForm.reset();
});

// === Helpers ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function recalcOriginalTotal() {
  originalTotal = debts.reduce((s, d) => s + d.original, 0) + totalPaid;
  save();
}

// === Init ===
render();
