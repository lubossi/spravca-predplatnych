/**
 * SPRÁVCA PREDPLATNÝCH (Subscription Manager)
 * Supabase Cloud Storage Edition – synchronizácia medzi všetkými zariadeniami
 */

// ============================================================
//  SUPABASE KONFIGURÁCIA
// ============================================================
const SUPABASE_URL = 'https://dhkxjrttoitqtecrsgzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa3hqcnR0b2l0cXRlY3JzZ3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mjc1MzcsImV4cCI6MjEwMjMwMzUzN30.8bSYvp7bqk_gGzQJ1cU6fjhTJoYMFEEHPlHcXvZA-G4';
const TABLE = 'subscriptions';

let _supabaseClient = null;
function getSupabaseClient() {
    if (!_supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (e) {
            console.error('Chyba inicializácie Supabase klienta:', e);
        }
    }
    return _supabaseClient;
}

// ============================================================
//  HLAVNÁ LOGIKA APLIKÁCIE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // ——— App State ———
    let subscriptions = [];
    let currentView = 'dashboard';
    let deleteTargetId = null;
    let notificationDaysFilter = 7;
    let selectedCalcSubIds = new Set();
    let storageMode = 'loading'; // 'supabase' | 'localStorage' | 'loading'

    const STORAGE_KEY = 'spravca_predplatnych_data';

    const DEMO_SUBSCRIPTIONS = [
        { id: 'sub_demo_1', name: 'Netflix Premium', price: 17.99, billingCycle: 'monthly', category: 'Zábava', paymentMethod: 'Platebná karta', nextPaymentDate: getRelativeDate(3), color: '#e50914', notes: '4K Ultra HD rodinné konto', active: true },
        { id: 'sub_demo_2', name: 'Spotify Family', price: 10.99, billingCycle: 'monthly', category: 'Zábava', paymentMethod: 'PayPal', nextPaymentDate: getRelativeDate(11), color: '#1db954', notes: 'Pre 6 členov rodiny', active: true },
        { id: 'sub_demo_3', name: 'Optický Internet Telekom', price: 22.90, billingCycle: 'monthly', category: 'Domácnosť', paymentMethod: 'Bankový prevod', nextPaymentDate: getRelativeDate(1), color: '#e20074', notes: 'Rýchlosť 500/50 Mbps', active: true },
        { id: 'sub_demo_4', name: 'Posilňovňa GymBeam', price: 29.00, billingCycle: 'monthly', category: 'Zdravie', paymentMethod: 'Platebná karta', nextPaymentDate: getRelativeDate(6), color: '#f59e0b', notes: 'Mesačné členstvo bez viazanosti', active: true },
        { id: 'sub_demo_5', name: 'ChatGPT Plus (OpenAI)', price: 20.00, billingCycle: 'monthly', category: 'Nástroje', paymentMethod: 'Apple Pay', nextPaymentDate: getRelativeDate(18), color: '#10a37f', notes: 'GPT-4o a generovanie obrázkov', active: true },
        { id: 'sub_demo_6', name: 'Adobe Creative Cloud', price: 380.00, billingCycle: 'yearly', category: 'Práca', paymentMethod: 'Platebná karta', nextPaymentDate: getRelativeDate(45), color: '#ff0000', notes: 'Ročné predplatné pre grafiku', active: true },
        { id: 'sub_demo_7', name: 'iCloud+ 200GB', price: 2.99, billingCycle: 'monthly', category: 'Nástroje', paymentMethod: 'Apple Pay', nextPaymentDate: getRelativeDate(2), color: '#3b82f6', notes: 'Zálohovanie fotiek a iPhone', active: true }
    ];

    // ============================================================
    //  POMOCNÉ FUNKCIE
    // ============================================================
    function getRelativeDate(daysAhead) {
        const d = new Date();
        d.setDate(d.getDate() + daysAhead);
        return d.toISOString().split('T')[0];
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(amount);
    }

    function formatDateSK(dateString) {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-');
        return `${parseInt(day)}. ${parseInt(month)}. ${year}`;
    }

    function getDaysUntil(dateString) {
        if (!dateString) return 999;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateString);
        target.setHours(0, 0, 0, 0);
        return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }

    // Bezpečná konverzia z DB snake_case do JS camelCase
    function dbToApp(row) {
        if (!row) return null;
        return {
            id: String(row.id || ('sub_' + Date.now() + Math.random().toString(36).substr(2, 4))),
            name: String(row.name || 'Neznáma služba'),
            price: parseFloat(row.price) || 0,
            billingCycle: String(row.billing_cycle || row.billingCycle || 'monthly'),
            category: String(row.category || 'Iné'),
            paymentMethod: String(row.payment_method || row.paymentMethod || 'Platebná karta'),
            nextPaymentDate: String(row.next_payment_date || row.nextPaymentDate || getRelativeDate(30)),
            color: String(row.color || '#6366f1'),
            notes: String(row.notes || ''),
            active: row.active !== false
        };
    }

    // Konverzia z JS camelCase do DB snake_case
    function appToDB(sub) {
        return {
            id: sub.id,
            name: sub.name,
            price: sub.price,
            billing_cycle: sub.billingCycle,
            category: sub.category,
            payment_method: sub.paymentMethod,
            next_payment_date: sub.nextPaymentDate,
            color: sub.color || '#6366f1',
            notes: sub.notes || '',
            active: sub.active !== false
        };
    }

    // ============================================================
    //  STORAGE STATUS BADGE
    // ============================================================
    function updateStorageStatusBadge() {
        const badge = document.getElementById('storageStatusBadge');
        if (!badge) return;
        if (storageMode === 'supabase') {
            badge.classList.remove('offline');
            badge.innerHTML = `<i class="fa-solid fa-cloud"></i> Synchronizované cez Supabase`;
        } else if (storageMode === 'localStorage') {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-database"></i> Offline (LocalStorage)`;
        } else {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Pripájam k Supabase...`;
        }
    }

    // ============================================================
    //  SUPABASE – CRUD OPERÁCIE
    // ============================================================
    async function loadFromSupabase() {
        const client = getSupabaseClient();
        if (!client) {
            console.warn('Supabase klient nie je inicializovaný');
            return null;
        }
        try {
            const { data, error } = await client
                .from(TABLE)
                .select('*');
            if (error) throw error;
            if (!Array.isArray(data)) return [];
            return data.map(dbToApp).filter(Boolean);
        } catch (e) {
            console.warn('Supabase načítanie zlyhalo:', e.message || e);
            return null;
        }
    }

    async function addToSupabase(sub) {
        const client = getSupabaseClient();
        if (!client) return false;
        try {
            const { error } = await client.from(TABLE).insert(appToDB(sub));
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Supabase insert zlyhalo:', e.message || e);
            return false;
        }
    }

    async function updateInSupabase(sub) {
        const client = getSupabaseClient();
        if (!client) return false;
        try {
            const { error } = await client.from(TABLE).update(appToDB(sub)).eq('id', sub.id);
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Supabase update zlyhalo:', e.message || e);
            return false;
        }
    }

    async function deleteFromSupabase(subId) {
        const client = getSupabaseClient();
        if (!client) return false;
        try {
            const { error } = await client.from(TABLE).delete().eq('id', subId);
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Supabase delete zlyhalo:', e.message || e);
            return false;
        }
    }

    async function bulkUpsertToSupabase(subs) {
        const client = getSupabaseClient();
        if (!client) return false;
        try {
            const { error } = await client.from(TABLE).upsert(subs.map(appToDB));
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Supabase upsert zlyhalo:', e.message || e);
            return false;
        }
    }

    async function deleteAllFromSupabase() {
        const client = getSupabaseClient();
        if (!client) return false;
        try {
            const { error } = await client.from(TABLE).delete().neq('id', '___none___');
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Supabase delete all zlyhalo:', e.message || e);
            return false;
        }
    }

    // ============================================================
    //  INICIALIZÁCIA DÁT (Supabase → LocalStorage fallback)
    // ============================================================
    async function initData() {
        storageMode = 'loading';
        updateStorageStatusBadge();

        const cloudData = await loadFromSupabase();

        if (cloudData !== null) {
            storageMode = 'supabase';
            if (cloudData.length === 0) {
                const ok = await bulkUpsertToSupabase(DEMO_SUBSCRIPTIONS);
                subscriptions = ok ? [...DEMO_SUBSCRIPTIONS] : [...DEMO_SUBSCRIPTIONS];
            } else {
                subscriptions = cloudData;
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
            showToast('Synchronizované cez Supabase ☁️', 'success');
        } else {
            storageMode = 'localStorage';
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                try { subscriptions = JSON.parse(raw); }
                catch (e) { subscriptions = [...DEMO_SUBSCRIPTIONS]; }
            } else {
                subscriptions = [...DEMO_SUBSCRIPTIONS];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
            }
            showToast('Offline režim: Používam lokálne dáta.', 'warning');
        }

        updateStorageStatusBadge();
        updateAllViews();
    }

    function syncToLocalStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
    }

    // ============================================================
    //  CRUD OBÁLKY
    // ============================================================
    async function addSubscription(newSub) {
        subscriptions.push(newSub);
        syncToLocalStorage();
        updateAllViews();
        if (storageMode === 'supabase') {
            const ok = await addToSupabase(newSub);
            if (!ok) showToast('Predplatné uložené lokálne, sync so Supabase zlyhal.', 'warning');
        }
    }

    async function updateSubscription(updatedSub) {
        const idx = subscriptions.findIndex(s => s.id === updatedSub.id);
        if (idx !== -1) subscriptions[idx] = updatedSub;
        syncToLocalStorage();
        updateAllViews();
        if (storageMode === 'supabase') {
            const ok = await updateInSupabase(updatedSub);
            if (!ok) showToast('Zmeny uložené lokálne, sync so Supabase zlyhal.', 'warning');
        }
    }

    async function deleteSubscription(subId) {
        subscriptions = subscriptions.filter(s => s.id !== subId);
        syncToLocalStorage();
        updateAllViews();
        if (storageMode === 'supabase') {
            const ok = await deleteFromSupabase(subId);
            if (!ok) showToast('Zmazané lokálne, sync so Supabase zlyhal.', 'warning');
        }
    }

    async function resetToDemo() {
        subscriptions = JSON.parse(JSON.stringify(DEMO_SUBSCRIPTIONS));
        syncToLocalStorage();
        updateAllViews();
        if (storageMode === 'supabase') {
            await deleteAllFromSupabase();
            await bulkUpsertToSupabase(subscriptions);
        }
    }

    // ============================================================
    //  REAL-TIME SYNC
    // ============================================================
    function subscribeToRealtime() {
        const client = getSupabaseClient();
        if (!client || storageMode !== 'supabase') return;
        try {
            client
                .channel('subscriptions-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, async () => {
                    const freshData = await loadFromSupabase();
                    if (freshData !== null) {
                        subscriptions = freshData;
                        syncToLocalStorage();
                        updateAllViews();
                        showToast('Dáta synchronizované z iného zariadenia ☁️', 'info');
                    }
                })
                .subscribe();
        } catch (e) {
            console.warn('Realtime subscription error:', e);
        }
    }

    // ============================================================
    //  NAVIGÁCIA
    // ============================================================
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('pageTitle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const mobileToggleBtn = document.getElementById('mobileToggleBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    function switchView(viewName) {
        currentView = viewName;
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-view') === viewName);
        });
        viewSections.forEach(section => {
            section.classList.toggle('active', section.id === `view-${viewName}`);
        });
        const titleMap = {
            'dashboard': 'Prehľad',
            'subscriptions': 'Moje predplatné',
            'add-subscription': 'Pridať predplatné',
            'calculator': 'Kalkulačka úspor ("Čo ak...")',
            'notifications': 'Upozornenia a nadchádzajúce platby',
            'export': 'Export a záloha dát'
        };
        pageTitle.textContent = titleMap[viewName] || 'Správca predplatných';
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (viewName === 'calculator') renderCalculator();
        if (viewName === 'notifications') renderNotifications();
        if (viewName === 'subscriptions') renderSubscriptions();
        if (viewName === 'dashboard') renderDashboard();
    }

    mobileToggleBtn.addEventListener('click', () => { sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); });
    closeSidebarBtn.addEventListener('click', () => { sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
    sidebarOverlay.addEventListener('click', () => { sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
    navLinks.forEach(link => link.addEventListener('click', e => { e.preventDefault(); switchView(link.getAttribute('data-view')); }));

    document.getElementById('quickAddBtn').addEventListener('click', () => switchView('add-subscription'));
    document.getElementById('goToSubscriptionsBtn')?.addEventListener('click', () => switchView('subscriptions'));
    document.getElementById('viewAlertsBtn')?.addEventListener('click', () => switchView('notifications'));

    // ============================================================
    //  VÝPOČTY
    // ============================================================
    function getTotals() {
        let monthlyTotal = 0, yearlyTotal = 0;
        subscriptions.forEach(sub => {
            const price = parseFloat(sub.price) || 0;
            monthlyTotal += sub.billingCycle === 'monthly' ? price : price / 12;
            yearlyTotal += sub.billingCycle === 'monthly' ? price * 12 : price;
        });
        return { monthlyTotal, yearlyTotal };
    }

    function updateAllViews() {
        const { monthlyTotal } = getTotals();
        document.getElementById('sidebarMonthlyTotal').textContent = formatMoney(monthlyTotal);
        renderDashboard();
        renderSubscriptions();
        renderCalculator();
        renderNotifications();
    }

    // ============================================================
    //  1. DASHBOARD
    // ============================================================
    function renderDashboard() {
        const { monthlyTotal, yearlyTotal } = getTotals();
        document.getElementById('dashboardMonthly').textContent = formatMoney(monthlyTotal);
        document.getElementById('dashboardYearly').textContent = formatMoney(yearlyTotal);
        document.getElementById('dashboardCount').textContent = subscriptions.length;

        const sorted = [...subscriptions].sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        const nxt = document.getElementById('dashboardNextPayment');
        const nxtSub = document.getElementById('dashboardNextPaymentSubtext');
        if (sorted.length > 0) {
            const nearest = sorted[0];
            const days = getDaysUntil(nearest.nextPaymentDate);
            nxt.textContent = `${nearest.name} (${formatMoney(nearest.price)})`;
            if (days === 0) { nxtSub.textContent = 'Splatné dnes!'; nxtSub.style.color = 'var(--danger)'; }
            else if (days === 1) { nxtSub.textContent = 'Splatné zajtra!'; nxtSub.style.color = 'var(--warning)'; }
            else if (days < 0) { nxtSub.textContent = `Po splatnosti (${Math.abs(days)} dní)`; nxtSub.style.color = 'var(--danger)'; }
            else { nxtSub.textContent = `O ${days} dní (${formatDateSK(nearest.nextPaymentDate)})`; nxtSub.style.color = 'var(--text-subtle)'; }
        } else { nxt.textContent = 'Žiadne'; nxtSub.textContent = 'Nemáte aktívne predplatné'; }

        const imminentPayments = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= 7; });
        const alertBanner = document.getElementById('dashboardAlertBanner');
        if (imminentPayments.length > 0) {
            alertBanner.classList.remove('hidden');
            document.getElementById('alertBannerTitle').textContent = `Upozornenie: Blíži sa ${imminentPayments.length} platba!`;
            document.getElementById('alertBannerText').textContent = `Máte platby splatné v najbližších 7 dňoch v celkovej hodnote ${formatMoney(imminentPayments.reduce((acc, s) => acc + s.price, 0))}.`;
        } else { alertBanner.classList.add('hidden'); }

        const tbody = document.getElementById('dashboardUpcomingTable');
        tbody.innerHTML = '';
        const emptyEl = document.getElementById('dashboardUpcomingEmpty');
        if (sorted.length === 0) { emptyEl.classList.remove('hidden'); }
        else {
            emptyEl.classList.add('hidden');
            sorted.slice(0, 5).forEach(sub => {
                const days = getDaysUntil(sub.nextPaymentDate);
                let badgeHtml = days < 0 ? `<span class="badge badge-danger">Po splatnosti</span>` : days === 0 ? `<span class="badge badge-danger">Dnes</span>` : days <= 3 ? `<span class="badge badge-warning">O ${days} dni</span>` : `<span class="badge badge-neutral">O ${days} dní</span>`;
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><div class="sub-item-cell"><div class="sub-item-icon" style="background-color:${sub.color||'#6366f1'}"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i></div><span>${escapeHtml(sub.name)}</span></div></td><td><span class="sub-badge-category">${escapeHtml(sub.category)}</span></td><td><strong>${formatMoney(sub.price)}</strong> <small class="text-subtle">/${sub.billingCycle==='monthly'?'mes.':'rok'}</small></td><td>${formatDateSK(sub.nextPaymentDate)}</td><td>${badgeHtml}</td>`;
                tbody.appendChild(tr);
            });
        }

        const categoryTotals = {};
        subscriptions.forEach(sub => {
            const cat = sub.category || 'Iné';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (sub.billingCycle === 'monthly' ? sub.price : sub.price / 12);
        });
        const catList = document.getElementById('dashboardCategoriesList');
        catList.innerHTML = '';
        Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]).forEach(cat => {
            const val = categoryTotals[cat];
            const pct = monthlyTotal > 0 ? Math.round((val / monthlyTotal) * 100) : 0;
            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `<div class="cat-item-top"><span class="cat-item-name"><i class="fa-solid ${getCategoryIcon(cat)}" style="color:${getCategoryColor(cat)};margin-right:6px;"></i>${cat} (${pct}%)</span><span class="cat-item-price">${formatMoney(val)}/mes.</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:${getCategoryColor(cat)};"></div></div>`;
            catList.appendChild(div);
        });
        if (!Object.keys(categoryTotals).length) catList.innerHTML = `<p class="text-subtle" style="text-align:center;">Žiadne dáta</p>`;
    }

    // ============================================================
    //  2. ZOZNAM PREDPLATNÝCH
    // ============================================================
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBySelect = document.getElementById('sortBySelect');
    searchInput.addEventListener('input', renderSubscriptions);
    categoryFilter.addEventListener('change', renderSubscriptions);
    sortBySelect.addEventListener('change', renderSubscriptions);
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => switchView('add-subscription'));

    function renderSubscriptions() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedCat = categoryFilter.value;
        const sortBy = sortBySelect.value;

        let filtered = subscriptions.filter(s => {
            const matchQ = s.name.toLowerCase().includes(query) || (s.notes && s.notes.toLowerCase().includes(query));
            return matchQ && (selectedCat === 'all' || s.category === selectedCat);
        });

        filtered.sort((a, b) => {
            if (sortBy === 'nextPayment') return new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate);
            if (sortBy === 'priceDesc') return (b.billingCycle === 'monthly' ? b.price : b.price/12) - (a.billingCycle === 'monthly' ? a.price : a.price/12);
            if (sortBy === 'priceAsc') return (a.billingCycle === 'monthly' ? a.price : a.price/12) - (b.billingCycle === 'monthly' ? b.price : b.price/12);
            if (sortBy === 'nameAsc') return a.name.localeCompare(b.name, 'sk');
            return 0;
        });

        const container = document.getElementById('subscriptionsContainer');
        const emptyState = document.getElementById('subscriptionsEmpty');
        container.innerHTML = '';
        if (filtered.length === 0) { emptyState.classList.remove('hidden'); return; }
        emptyState.classList.add('hidden');

        filtered.forEach(sub => {
            const days = getDaysUntil(sub.nextPaymentDate);
            const card = document.createElement('div');
            card.className = 'sub-card glass-card';
            card.innerHTML = `
                <div class="sub-card-top">
                    <span class="sub-badge-category"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i> ${escapeHtml(sub.category)}</span>
                    <span class="badge ${days <= 3 && days >= 0 ? 'badge-warning' : days < 0 ? 'badge-danger' : 'badge-neutral'}">${days === 0 ? 'Dnes' : days > 0 ? `O ${days} dní` : 'Po splatnosti'}</span>
                </div>
                <div class="sub-card-title-group">
                    <div class="sub-card-icon" style="background-color:${sub.color||'#6366f1'}"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i></div>
                    <div><h3 class="sub-card-name">${escapeHtml(sub.name)}</h3><span class="sub-card-price-cycle">${sub.paymentMethod||'Platba'}</span></div>
                </div>
                <div style="margin-bottom:16px;"><span class="sub-card-price-tag">${formatMoney(sub.price)}</span><span class="sub-card-price-cycle">/${sub.billingCycle==='monthly'?'mesačne':'ročne'}</span></div>
                <div class="sub-card-details">
                    <div class="sub-detail-row"><span class="sub-detail-label">Ďalšia platba:</span><span class="sub-detail-value">${formatDateSK(sub.nextPaymentDate)}</span></div>
                    <div class="sub-detail-row"><span class="sub-detail-label">Ročné náklady:</span><span class="sub-detail-value">${formatMoney(sub.billingCycle==='monthly'?sub.price*12:sub.price)}</span></div>
                    ${sub.notes ? `<div class="sub-detail-row"><span class="sub-detail-label">Poznámka:</span><span class="sub-detail-value text-truncate" title="${escapeHtml(sub.notes)}">${escapeHtml(sub.notes)}</span></div>` : ''}
                </div>
                <div class="sub-card-actions">
                    <button class="btn btn-secondary btn-sm edit-sub-btn" data-id="${sub.id}"><i class="fa-solid fa-pen"></i> Upraviť</button>
                    <button class="btn btn-danger-outline btn-sm delete-sub-btn" data-id="${sub.id}"><i class="fa-solid fa-trash"></i> Zmazať</button>
                </div>`;
            container.appendChild(card);
        });

        document.querySelectorAll('.edit-sub-btn').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
        document.querySelectorAll('.delete-sub-btn').forEach(btn => btn.addEventListener('click', () => openDeleteModal(btn.dataset.id)));
    }

    // ============================================================
    //  3. FORMULÁR PRIDANIE
    // ============================================================
    const subscriptionForm = document.getElementById('subscriptionForm');
    document.getElementById('subNextPaymentDate').value = getRelativeDate(30);

    subscriptionForm.addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('subName').value.trim();
        const price = parseFloat(document.getElementById('subPrice').value);
        const billingCycle = document.getElementById('subBillingCycle').value;
        const category = document.getElementById('subCategory').value;
        const paymentMethod = document.getElementById('subPaymentMethod').value;
        const nextPaymentDate = document.getElementById('subNextPaymentDate').value;
        const color = document.getElementById('subColor').value;
        const notes = document.getElementById('subNotes').value.trim();

        if (!name || isNaN(price) || !nextPaymentDate) { showToast('Prosím, vyplňte všetky povinné polia.', 'error'); return; }

        const newSub = { id: 'sub_' + Date.now(), name, price, billingCycle, category, paymentMethod, nextPaymentDate, color, notes, active: true };
        await addSubscription(newSub);
        subscriptionForm.reset();
        document.getElementById('subNextPaymentDate').value = getRelativeDate(30);
        showToast(`"${name}" uložené a synchronizované cez Supabase ☁️`, 'success');
        switchView('subscriptions');
    });

    document.getElementById('cancelFormBtn').addEventListener('click', () => { subscriptionForm.reset(); switchView('subscriptions'); });

    // ============================================================
    //  4. EDIT & DELETE MODALS
    // ============================================================
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    document.getElementById('closeEditModalBtn').addEventListener('click', () => editModal.close());
    document.getElementById('cancelEditBtn').addEventListener('click', () => editModal.close());

    function openEditModal(subId) {
        const sub = subscriptions.find(s => s.id === subId);
        if (!sub) return;
        document.getElementById('editSubId').value = sub.id;
        document.getElementById('editSubName').value = sub.name;
        document.getElementById('editSubPrice').value = sub.price;
        document.getElementById('editSubBillingCycle').value = sub.billingCycle;
        document.getElementById('editSubCategory').value = sub.category;
        document.getElementById('editSubPaymentMethod').value = sub.paymentMethod || 'Platebná karta';
        document.getElementById('editSubNextPaymentDate').value = sub.nextPaymentDate;
        document.getElementById('editSubColor').value = sub.color || '#6366f1';
        document.getElementById('editSubNotes').value = sub.notes || '';
        editModal.showModal();
    }

    editForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = document.getElementById('editSubId').value;
        const existing = subscriptions.find(s => s.id === id);
        if (!existing) return;
        const updated = {
            ...existing,
            name: document.getElementById('editSubName').value.trim(),
            price: parseFloat(document.getElementById('editSubPrice').value),
            billingCycle: document.getElementById('editSubBillingCycle').value,
            category: document.getElementById('editSubCategory').value,
            paymentMethod: document.getElementById('editSubPaymentMethod').value,
            nextPaymentDate: document.getElementById('editSubNextPaymentDate').value,
            color: document.getElementById('editSubColor').value,
            notes: document.getElementById('editSubNotes').value.trim()
        };
        await updateSubscription(updated);
        editModal.close();
        showToast('Zmeny uložené a synchronizované cez Supabase ☁️', 'success');
    });

    const deleteModal = document.getElementById('deleteModal');
    document.getElementById('closeDeleteModalBtn').addEventListener('click', () => deleteModal.close());
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.close());

    function openDeleteModal(subId) {
        const sub = subscriptions.find(s => s.id === subId);
        if (!sub) return;
        deleteTargetId = subId;
        document.getElementById('deleteTargetName').textContent = sub.name;
        deleteModal.showModal();
    }

    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        if (!deleteTargetId) return;
        await deleteSubscription(deleteTargetId);
        deleteTargetId = null;
        deleteModal.close();
        showToast('Predplatné odstránené zo Supabase ☁️', 'info');
    });

    // ============================================================
    //  5. KALKULAČKA ÚSPOR
    // ============================================================
    let allCalcSelected = false;
    document.getElementById('calcSelectAllBtn').addEventListener('click', () => {
        allCalcSelected = !allCalcSelected;
        if (allCalcSelected) { subscriptions.forEach(s => selectedCalcSubIds.add(s.id)); document.getElementById('calcSelectAllBtn').textContent = 'Odznačiť všetky'; }
        else { selectedCalcSubIds.clear(); document.getElementById('calcSelectAllBtn').textContent = 'Označiť všetky'; }
        renderCalculator();
    });

    function renderCalculator() {
        const container = document.getElementById('calcItemsContainer');
        container.innerHTML = '';
        if (!subscriptions.length) { container.innerHTML = `<p class="text-subtle" style="text-align:center;">Žiadne predplatné pre výpočet.</p>`; return; }
        subscriptions.forEach(sub => {
            const isChecked = selectedCalcSubIds.has(sub.id);
            const mPrice = sub.billingCycle === 'monthly' ? sub.price : sub.price / 12;
            const item = document.createElement('div');
            item.className = 'calc-item';
            item.innerHTML = `<div class="calc-item-left"><input type="checkbox" class="calc-item-checkbox" ${isChecked?'checked':''} data-id="${sub.id}"><div class="calc-item-info"><strong>${escapeHtml(sub.name)}</strong><span>${escapeHtml(sub.category)}</span></div></div><div class="calc-item-price">${formatMoney(mPrice)}/mes.</div>`;
            item.addEventListener('click', e => {
                if (e.target.tagName !== 'INPUT') item.querySelector('.calc-item-checkbox').checked = !item.querySelector('.calc-item-checkbox').checked;
                const cb = item.querySelector('.calc-item-checkbox');
                if (cb.checked) selectedCalcSubIds.add(sub.id); else selectedCalcSubIds.delete(sub.id);
                updateSavingsCalculations();
            });
            container.appendChild(item);
        });
        updateSavingsCalculations();
    }

    function updateSavingsCalculations() {
        let monthlySavings = 0, yearlySavings = 0;
        subscriptions.forEach(sub => {
            if (selectedCalcSubIds.has(sub.id)) {
                monthlySavings += sub.billingCycle === 'monthly' ? sub.price : sub.price / 12;
                yearlySavings += sub.billingCycle === 'monthly' ? sub.price * 12 : sub.price;
            }
        });
        document.getElementById('calcMonthlySavings').textContent = formatMoney(monthlySavings);
        document.getElementById('calcYearlySavings').textContent = formatMoney(yearlySavings);

        const targetsList = document.getElementById('calcTargetsList');
        targetsList.innerHTML = '';
        [{ name: 'Kino pre dvoch + pukance', price: 30, icon: 'fa-film' }, { name: 'Ročné predplatné knižnej aplikácie', price: 80, icon: 'fa-book' }, { name: 'Kvalitné bezdrôtové slúchadlá', price: 150, icon: 'fa-headphones' }, { name: 'Víkendový wellness pobyt', price: 300, icon: 'fa-spa' }, { name: 'Nový smartfón strednej triedy', price: 600, icon: 'fa-mobile-screen' }, { name: 'Letná dovolenka pri mori', price: 1200, icon: 'fa-plane' }].forEach(m => {
            const isAchieved = yearlySavings >= m.price;
            const div = document.createElement('div');
            div.className = `target-item ${isAchieved ? 'achieved' : ''}`;
            div.innerHTML = `<i class="fa-solid ${m.icon} target-icon"></i><div class="target-text">${m.name} (${formatMoney(m.price)})</div><div class="target-status">${isAchieved ? '<i class="fa-solid fa-check-circle text-success"></i> Dosiahnuté!' : 'Chýba ' + formatMoney(m.price - yearlySavings)}</div>`;
            targetsList.appendChild(div);
        });
    }

    // ============================================================
    //  6. NOTIFIKÁCIE
    // ============================================================
    document.querySelectorAll('.days-filter-group button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.days-filter-group button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            notificationDaysFilter = parseInt(btn.dataset.days);
            renderNotifications();
        });
    });

    function renderNotifications() {
        const container = document.getElementById('notificationsList');
        const badge = document.getElementById('navNotificationBadge');
        container.innerHTML = '';
        const within7 = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= 7; });
        if (within7.length > 0) { badge.textContent = within7.length; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }

        const filtered = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= notificationDaysFilter; }).sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        if (!filtered.length) { container.innerHTML = `<div class="empty-state"><i class="fa-regular fa-bell-slash"></i><h3>Žiadne platby v najbližších ${notificationDaysFilter} dňoch</h3><p>Všetky vaše platby sú v poriadku.</p></div>`; return; }

        filtered.forEach(sub => {
            const days = getDaysUntil(sub.nextPaymentDate);
            const dayText = days === 0 ? 'Splatné dnes!' : days === 1 ? 'Splatné zajtra!' : `O ${days} dní (${formatDateSK(sub.nextPaymentDate)})`;
            const badgeClass = days === 0 ? 'badge-danger' : days <= 3 ? 'badge-warning' : 'badge-neutral';
            const div = document.createElement('div');
            div.className = 'notif-item';
            div.innerHTML = `<div class="notif-left"><div class="notif-icon-badge" style="background-color:${sub.color||'#6366f1'}"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i></div><div class="notif-info"><h4>${escapeHtml(sub.name)}</h4><p>${escapeHtml(sub.category)} • ${sub.paymentMethod||'Platba'}</p></div></div><div class="notif-right"><div class="notif-price">${formatMoney(sub.price)}</div><span class="badge ${badgeClass}">${dayText}</span></div>`;
            container.appendChild(div);
        });
    }

    // ============================================================
    //  7. EXPORT & IMPORT
    // ============================================================
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
        if (!subscriptions.length) { showToast('Nemáte žiadne dáta na export.', 'warning'); return; }
        let csv = '\uFEFF' + 'Názov služby;Suma (€);Frekvencia;Kategória;Spôsob platby;Dátum platby;Poznámka\n';
        subscriptions.forEach(s => { csv += `"${s.name}";"${s.price}";"${s.billingCycle==='monthly'?'Mesačne':'Ročne'}";"${s.category}";"${s.paymentMethod||''}";"${s.nextPaymentDate}";"${(s.notes||'').replace(/;/g,',')}"\n`; });
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url; a.download = `predplatne_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('CSV súbor bol stiahnutý!', 'success');
    });

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
        const url = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(subscriptions, null, 2));
        const a = document.createElement('a');
        a.href = url; a.download = `predplatne_zaloha_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('JSON záloha bola stiahnutá!', 'success');
    });

    document.getElementById('importJsonInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async evt => {
            try {
                const parsed = JSON.parse(evt.target.result);
                if (Array.isArray(parsed)) {
                    subscriptions = parsed;
                    syncToLocalStorage();
                    if (storageMode === 'supabase') {
                        await deleteAllFromSupabase();
                        await bulkUpsertToSupabase(subscriptions);
                    }
                    updateAllViews();
                    showToast('Dáta importované a synchronizované cez Supabase ☁️', 'success');
                    switchView('dashboard');
                } else showToast('Neplatný formát JSON súboru.', 'error');
            } catch { showToast('Chyba pri čítaní JSON súboru.', 'error'); }
        };
        reader.readAsText(file);
    });

    document.getElementById('resetDemoBtn').addEventListener('click', async () => {
        if (confirm('Naozaj chcete obnoviť ukážkové predplatné? Všetky vaše dáta v Supabase budú nahradené.')) {
            await resetToDemo();
            showToast('Ukážkové dáta obnovené v Supabase ☁️', 'info');
            switchView('dashboard');
        }
    });

    // ============================================================
    //  KATEGÓRIA HELPERS
    // ============================================================
    function getCategoryIcon(cat) {
        switch (cat) {
            case 'Zábava': return 'fa-tv';
            case 'Práca': return 'fa-briefcase';
            case 'Nástroje': return 'fa-screwdriver-wrench';
            case 'Zdravie': return 'fa-heart-pulse';
            case 'Domácnosť': return 'fa-house-signal';
            default: return 'fa-layer-group';
        }
    }

    function getCategoryColor(cat) {
        switch (cat) {
            case 'Zábava': return '#8b5cf6';
            case 'Práca': return '#3b82f6';
            case 'Nástroje': return '#10b981';
            case 'Zdravie': return '#f59e0b';
            case 'Domácnosť': return '#ec4899';
            default: return '#64748b';
        }
    }

    // ============================================================
    //  TOAST NOTIFIKÁCIE
    // ============================================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: 'fa-check-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle', error: 'fa-circle-xmark' };
        toast.innerHTML = `<i class="fa-solid ${icons[type]||'fa-info-circle'}"></i> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; setTimeout(() => toast.remove(), 300); }, 3500);
    }

    // ============================================================
    //  ŠTART
    // ============================================================
    initData().then(() => {
        subscribeToRealtime();
        switchView('dashboard');
    });
});
