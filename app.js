/**
 * SPRÁVCA PREDPLATNÝCH (Subscription Manager)
 * Supabase Auth & Cloud Storage Edition
 * Synchronizácia medzi zariadeniami s e-mailovou autentifikáciou a RLS
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
document.addEventListener('DOMContentLoaded', async () => {
    // ——— App State ———
    let subscriptions = [];
    let currentUser = null;
    let currentView = 'dashboard';
    let deleteTargetId = null;
    let notificationDaysFilter = 7;
    let selectedCalcSubIds = new Set();
    let storageMode = 'loading'; // 'supabase' | 'localStorage' | 'unauthenticated' | 'loading'
    let authMode = 'login'; // 'login' | 'register'
    let realtimeChannel = null;

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

    function generateId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return 'sub_' + crypto.randomUUID();
        }
        return 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function appToDB(sub, explicitUserId = null) {
        const userId = explicitUserId || currentUser?.id || null;
        return {
            id: String(sub.id || generateId()),
            user_id: userId,
            name: String(sub.name || 'Neznáma služba').trim(),
            price: parseFloat(sub.price) || 0,
            billing_cycle: (sub.billing_cycle === 'yearly' || sub.billingCycle === 'yearly') ? 'yearly' : 'monthly',
            category: String(sub.category || 'Iné').trim(),
            payment_method: String(sub.payment_method || sub.paymentMethod || 'Platebná karta').trim(),
            next_payment_date: String(sub.next_payment_date || sub.nextPaymentDate || getRelativeDate(30)),
            color: String(sub.color || '#6366f1'),
            notes: String(sub.notes || '').trim(),
            active: sub.active !== false
        };
    }

    // ============================================================
    //  STORAGE STATUS BADGE & USER PROFILE UI
    // ============================================================
    function updateStorageStatusBadge() {
        const badge = document.getElementById('storageStatusBadge');
        if (!badge) return;
        if (storageMode === 'supabase') {
            badge.classList.remove('offline');
            badge.innerHTML = `<i class="fa-solid fa-cloud"></i> Synchronizované cez Supabase`;
        } else if (storageMode === 'unauthenticated') {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-user-lock"></i> Neprihlásený (Kliknite pre prihlásenie)`;
        } else if (storageMode === 'localStorage') {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-database"></i> Offline režim`;
        } else {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Pripájam k Supabase...`;
        }
    }

    document.getElementById('storageStatusBadge')?.addEventListener('click', () => {
        if (!currentUser) openAuthModal('login');
    });

    function updateUserProfileUI() {
        const userAuthBadge = document.getElementById('userAuthBadge');
        const userEmailText = document.getElementById('userEmailText');
        const loginBtn = document.getElementById('loginBtn');
        const sidebarUserSection = document.getElementById('sidebarUserSection');
        const sidebarUserEmail = document.getElementById('sidebarUserEmail');
        const sidebarLoginSection = document.getElementById('sidebarLoginSection');

        if (currentUser) {
            const email = currentUser.email || 'Prihlásený používateľ';
            if (userAuthBadge) userAuthBadge.classList.remove('hidden');
            if (userEmailText) userEmailText.textContent = email;
            if (loginBtn) loginBtn.classList.add('hidden');
            if (sidebarUserSection) sidebarUserSection.classList.remove('hidden');
            if (sidebarUserEmail) sidebarUserEmail.textContent = email;
            if (sidebarLoginSection) sidebarLoginSection.classList.add('hidden');
        } else {
            if (userAuthBadge) userAuthBadge.classList.add('hidden');
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (sidebarUserSection) sidebarUserSection.classList.add('hidden');
            if (sidebarLoginSection) sidebarLoginSection.classList.remove('hidden');
        }
    }

    // ============================================================
    //  SUPABASE AUTH MODAL & AUTHENTICATION
    // ============================================================
    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');
    const authAlert = document.getElementById('authAlert');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    const authModalTitle = document.getElementById('authModalTitle');
    const authSubmitText = document.getElementById('authSubmitText');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authSwitchBtn = document.getElementById('authSwitchBtn');
    const authSwitchText = document.getElementById('authSwitchText');
    const passwordHint = document.getElementById('passwordHint');

    function openAuthModal(mode = 'login') {
        authMode = mode;
        setAuthMode(mode);
        clearAuthAlert();
        if (authModal && typeof authModal.showModal === 'function') {
            authModal.showModal();
        }
    }

    function closeAuthModal() {
        if (authModal && authModal.open) {
            authModal.close();
        }
        clearAuthAlert();
        if (authForm) authForm.reset();
    }

    function setAuthMode(mode) {
        authMode = mode;
        clearAuthAlert();
        if (mode === 'login') {
            tabLoginBtn?.classList.add('active');
            tabRegisterBtn?.classList.remove('active');
            if (authModalTitle) authModalTitle.textContent = 'Prihlásenie do účtu';
            if (authSubmitText) authSubmitText.textContent = 'Prihlásiť sa';
            if (authSwitchText) authSwitchText.textContent = 'Ešte nemáte účet?';
            if (authSwitchBtn) authSwitchBtn.textContent = 'Vytvorte si ho tu';
            if (passwordHint) passwordHint.style.display = 'none';
        } else {
            tabRegisterBtn?.classList.add('active');
            tabLoginBtn?.classList.remove('active');
            if (authModalTitle) authModalTitle.textContent = 'Vytvorenie nového účtu';
            if (authSubmitText) authSubmitText.textContent = 'Zaregistrovať sa';
            if (authSwitchText) authSwitchText.textContent = 'Už máte účet?';
            if (authSwitchBtn) authSwitchBtn.textContent = 'Prihláste sa tu';
            if (passwordHint) passwordHint.style.display = 'block';
        }
    }

    function showAuthAlert(message, type = 'error') {
        if (!authAlert) return;
        authAlert.className = `auth-alert ${type}`;
        authAlert.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> <span>${escapeHtml(message)}</span>`;
        authAlert.classList.remove('hidden');
    }

    function clearAuthAlert() {
        if (!authAlert) return;
        authAlert.classList.add('hidden');
        authAlert.textContent = '';
    }

    tabLoginBtn?.addEventListener('click', () => setAuthMode('login'));
    tabRegisterBtn?.addEventListener('click', () => setAuthMode('register'));
    authSwitchBtn?.addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
    document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('sidebarLoginBtn')?.addEventListener('click', () => openAuthModal('login'));

    async function handleLogout() {
        const oldUserId = currentUser?.id;
        const client = getSupabaseClient();
        if (client) {
            if (realtimeChannel) {
                try { client.removeChannel(realtimeChannel); } catch (e) {}
                realtimeChannel = null;
            }
            try {
                await client.auth.signOut();
            } catch (e) {
                console.warn('Chyba pri odhlásení:', e);
            }
        }

        // Dôkladné vyčistenie pamäte a lokálneho stavu
        currentUser = null;
        subscriptions = [];
        deleteTargetId = null;
        selectedCalcSubIds.clear();
        storageMode = 'unauthenticated';

        // Odstránenie cache odhláseného používateľa
        if (oldUserId) {
            localStorage.removeItem(STORAGE_KEY + '_' + oldUserId);
        }
        localStorage.removeItem(STORAGE_KEY);

        updateStorageStatusBadge();
        updateUserProfileUI();
        updateAllViews();
        showToast('Boli ste úspešne odhlásený.', 'info');
        openAuthModal('login');
    }

    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', handleLogout);

    authForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const client = getSupabaseClient();
        if (!client) {
            showAuthAlert('Chyba: Supabase klient nie je inicializovaný.');
            return;
        }

        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;

        if (!email || !password) {
            showAuthAlert('Vyplňte e-mail aj heslo.');
            return;
        }

        authSubmitBtn.disabled = true;
        authSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Spracovávam...`;
        clearAuthAlert();

        try {
            if (authMode === 'login') {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
                currentUser = data.user;
                closeAuthModal();
                showToast(`Vitajte späť, ${email}! 👋`, 'success');
            } else {
                const { data, error } = await client.auth.signUp({ email, password });
                if (error) throw error;
                if (data.session) {
                    currentUser = data.user;
                    closeAuthModal();
                    showToast('Účet bol úspešne vytvorený! 🎉', 'success');
                } else {
                    showAuthAlert('Registrácia úspešná! Skontrolujte si e-mailovú schránku pre potvrdenie účtu.', 'success');
                }
            }
        } catch (err) {
            let msg = err.message || 'Nastala neočakávaná chyba.';
            if (msg.includes('Invalid login credentials')) msg = 'Nesprávny e-mail alebo heslo.';
            else if (msg.includes('User already registered')) msg = 'Používateľ s týmto e-mailom už existuje.';
            else if (msg.includes('Password should be at least')) msg = 'Heslo musí mať aspoň 6 znakov.';
            else if (msg.includes('rate limit')) msg = 'Príliš veľa pokusov. Skúste to prosím neskôr.';
            showAuthAlert(msg, 'error');
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>${authMode === 'login' ? 'Prihlásiť sa' : 'Zaregistrovať sa'}</span>`;
        }
    });

    // ============================================================
    //  SUPABASE – CRUD OPERÁCIE S USER_ID & RLS
    // ============================================================
    async function loadFromSupabase() {
        const client = getSupabaseClient();
        if (!client || !currentUser) return null;
        try {
            const { data, error } = await client
                .from(TABLE)
                .select('*')
                .eq('user_id', currentUser.id);
            if (error) throw error;
            if (!Array.isArray(data)) return [];
            return data.map(dbToApp).filter(Boolean);
        } catch (e) {
            console.error('Supabase načítanie zlyhalo:', e.message || e);
            return null;
        }
    }

    async function addToSupabase(sub) {
        const client = getSupabaseClient();
        if (!client || !currentUser) return false;
        try {
            const payload = appToDB(sub, currentUser.id);
            const { error } = await client.from(TABLE).insert(payload);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Supabase insert zlyhalo:', e.message || e);
            showToast('Chyba Supabase: ' + (e.message || e), 'error');
            return false;
        }
    }

    async function updateInSupabase(sub) {
        const client = getSupabaseClient();
        if (!client || !currentUser) return false;
        try {
            const payload = appToDB(sub, currentUser.id);
            const { error } = await client.from(TABLE).update(payload).eq('id', sub.id).eq('user_id', currentUser.id);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Supabase update zlyhalo:', e.message || e);
            showToast('Chyba Supabase: ' + (e.message || e), 'error');
            return false;
        }
    }

    async function deleteFromSupabase(subId) {
        const client = getSupabaseClient();
        if (!client || !currentUser) return false;
        try {
            const { error } = await client.from(TABLE).delete().eq('id', subId).eq('user_id', currentUser.id);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Supabase delete zlyhalo:', e.message || e);
            showToast('Chyba Supabase: ' + (e.message || e), 'error');
            return false;
        }
    }

    async function bulkUpsertToSupabase(subs, explicitUserId = null) {
        const client = getSupabaseClient();
        const userId = explicitUserId || currentUser?.id;
        if (!client || !userId) {
            return { success: false, error: new Error('Používateľ nie je prihlásený') };
        }
        try {
            const payload = subs.map(s => ({ ...appToDB(s, userId), id: generateId() }));
            const { error } = await client.from(TABLE).insert(payload);
            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Supabase bulk insert zlyhalo:', e);
            return { success: false, error: e };
        }
    }

    async function deleteAllFromSupabase(explicitUserId = null) {
        const client = getSupabaseClient();
        const userId = explicitUserId || currentUser?.id;
        if (!client || !userId) {
            return { success: false, error: new Error('Používateľ nie je prihlásený') };
        }
        try {
            const { error } = await client.from(TABLE).delete().eq('user_id', userId);
            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Supabase delete all zlyhalo:', e);
            return { success: false, error: e };
        }
    }

    // ============================================================
    //  INICIALIZÁCIA DÁT (BEZ AUTOMATICKÝCH DEMO DÁT)
    // ============================================================
    async function initData() {
        if (!currentUser) {
            storageMode = 'unauthenticated';
            subscriptions = [];
            updateStorageStatusBadge();
            updateUserProfileUI();
            updateAllViews();
            return;
        }

        storageMode = 'loading';
        updateStorageStatusBadge();
        updateUserProfileUI();

        const cloudData = await loadFromSupabase();

        if (cloudData !== null) {
            storageMode = 'supabase';
            // Použijeme presne dáta používateľa (ak má 0 predplatných, zostáva prázdne)
            subscriptions = cloudData;
            localStorage.setItem(STORAGE_KEY + '_' + currentUser.id, JSON.stringify(subscriptions));
        } else {
            storageMode = 'localStorage';
            const raw = localStorage.getItem(STORAGE_KEY + '_' + currentUser.id);
            if (raw) {
                try { subscriptions = JSON.parse(raw); }
                catch (e) { subscriptions = []; }
            } else {
                subscriptions = [];
            }
            showToast('Offline režim: Používam lokálne dáta.', 'warning');
        }

        updateStorageStatusBadge();
        updateAllViews();
    }

    function syncToLocalStorage() {
        if (currentUser) {
            localStorage.setItem(STORAGE_KEY + '_' + currentUser.id, JSON.stringify(subscriptions));
        }
    }

    // ============================================================
    //  CRUD OBÁLKY
    // ============================================================
    async function addSubscription(newSub) {
        if (!currentUser) {
            openAuthModal('login');
            showToast('Pre uloženie predplatného sa najskôr prihláste.', 'warning');
            return;
        }
        subscriptions.push(newSub);
        syncToLocalStorage();
        updateAllViews();
        const ok = await addToSupabase(newSub);
        if (!ok) showToast('Predplatné uložené lokálne, sync so Supabase zlyhal.', 'warning');
    }

    async function updateSubscription(updatedSub) {
        if (!currentUser) {
            openAuthModal('login');
            return;
        }
        const idx = subscriptions.findIndex(s => s.id === updatedSub.id);
        if (idx !== -1) subscriptions[idx] = updatedSub;
        syncToLocalStorage();
        updateAllViews();
        const ok = await updateInSupabase(updatedSub);
        if (!ok) showToast('Zmeny uložené lokálne, sync so Supabase zlyhal.', 'warning');
    }

    async function deleteSubscription(subId) {
        if (!currentUser) {
            openAuthModal('login');
            return;
        }
        subscriptions = subscriptions.filter(s => s.id !== subId);
        syncToLocalStorage();
        updateAllViews();
        const ok = await deleteFromSupabase(subId);
        if (!ok) showToast('Zmazané lokálne, sync so Supabase zlyhal.', 'warning');
    }

    async function resetToDemo() {
        if (!currentUser) {
            openAuthModal('login');
            return;
        }
        const client = getSupabaseClient();
        if (client) {
            await client.from(TABLE).delete().eq('user_id', currentUser.id);
            const demoRows = DEMO_SUBSCRIPTIONS.map(s => appToDB(s, currentUser.id));
            await client.from(TABLE).insert(demoRows);
        }
        subscriptions = JSON.parse(JSON.stringify(DEMO_SUBSCRIPTIONS));
        syncToLocalStorage();
        updateAllViews();
    }

    // ============================================================
    //  REAL-TIME SYNC
    // ============================================================
    function subscribeToRealtime() {
        const client = getSupabaseClient();
        if (!client || !currentUser) return;
        try {
            if (realtimeChannel) client.removeChannel(realtimeChannel);
            realtimeChannel = client
                .channel('subscriptions-user-' + currentUser.id)
                .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${currentUser.id}` }, async () => {
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
        if (pageTitle) pageTitle.textContent = titleMap[viewName] || 'Správca predplatných';
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (viewName === 'calculator') renderCalculator();
        if (viewName === 'notifications') renderNotifications();
        if (viewName === 'subscriptions') renderSubscriptions();
        if (viewName === 'dashboard') renderDashboard();
    }

    mobileToggleBtn?.addEventListener('click', () => { sidebar?.classList.add('active'); sidebarOverlay?.classList.add('active'); });
    closeSidebarBtn?.addEventListener('click', () => { sidebar?.classList.remove('active'); sidebarOverlay?.classList.remove('active'); });
    sidebarOverlay?.addEventListener('click', () => { sidebar?.classList.remove('active'); sidebarOverlay?.classList.remove('active'); });
    navLinks.forEach(link => link.addEventListener('click', e => { e.preventDefault(); switchView(link.getAttribute('data-view')); }));

    document.getElementById('quickAddBtn')?.addEventListener('click', () => switchView('add-subscription'));
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
        const sidebarTotal = document.getElementById('sidebarMonthlyTotal');
        if (sidebarTotal) sidebarTotal.textContent = formatMoney(monthlyTotal);
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
        const dMonth = document.getElementById('dashboardMonthly');
        const dYear = document.getElementById('dashboardYearly');
        const dCount = document.getElementById('dashboardCount');
        if (dMonth) dMonth.textContent = formatMoney(monthlyTotal);
        if (dYear) dYear.textContent = formatMoney(yearlyTotal);
        if (dCount) dCount.textContent = subscriptions.length;

        const sorted = [...subscriptions].sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        const nxt = document.getElementById('dashboardNextPayment');
        const nxtSub = document.getElementById('dashboardNextPaymentSubtext');
        if (sorted.length > 0) {
            const nearest = sorted[0];
            const days = getDaysUntil(nearest.nextPaymentDate);
            if (nxt) nxt.textContent = `${nearest.name} (${formatMoney(nearest.price)})`;
            if (nxtSub) {
                if (days === 0) { nxtSub.textContent = 'Splatné dnes!'; nxtSub.style.color = 'var(--danger)'; }
                else if (days === 1) { nxtSub.textContent = 'Splatné zajtra!'; nxtSub.style.color = 'var(--warning)'; }
                else if (days < 0) { nxtSub.textContent = `Po splatnosti (${Math.abs(days)} dní)`; nxtSub.style.color = 'var(--danger)'; }
                else { nxtSub.textContent = `O ${days} dní (${formatDateSK(nearest.nextPaymentDate)})`; nxtSub.style.color = 'var(--text-subtle)'; }
            }
        } else {
            if (nxt) nxt.textContent = currentUser ? 'Žiadne' : 'Prihláste sa';
            if (nxtSub) nxtSub.textContent = currentUser ? 'Zatiaľ nemáte žiadne predplatné' : 'Pre zobrazenie údajov';
        }

        const imminentPayments = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= 7; });
        const alertBanner = document.getElementById('dashboardAlertBanner');
        if (imminentPayments.length > 0) {
            alertBanner?.classList.remove('hidden');
            const abTitle = document.getElementById('alertBannerTitle');
            const abText = document.getElementById('alertBannerText');
            if (abTitle) abTitle.textContent = `Upozornenie: Blíži sa ${imminentPayments.length} platba!`;
            if (abText) abText.textContent = `Máte platby splatné v najbližších 7 dňoch v celkovej hodnote ${formatMoney(imminentPayments.reduce((acc, s) => acc + s.price, 0))}.`;
        } else {
            alertBanner?.classList.add('hidden');
        }

        const tbody = document.getElementById('dashboardUpcomingTable');
        const emptyEl = document.getElementById('dashboardUpcomingEmpty');
        if (tbody) {
            tbody.innerHTML = '';
            if (sorted.length === 0) {
                emptyEl?.classList.remove('hidden');
                if (emptyEl) {
                    emptyEl.innerHTML = `<i class="fa-regular fa-folder-open"></i><p>${currentUser ? 'Zatiaľ nemáte žiadne predplatné.' : 'Prihláste sa pre zobrazenie predplatných.'}</p>`;
                }
            } else {
                emptyEl?.classList.add('hidden');
                sorted.slice(0, 5).forEach(sub => {
                    const days = getDaysUntil(sub.nextPaymentDate);
                    let badgeHtml = days < 0 ? `<span class="badge badge-danger">Po splatnosti</span>` : days === 0 ? `<span class="badge badge-danger">Dnes</span>` : days <= 3 ? `<span class="badge badge-warning">O ${days} dni</span>` : `<span class="badge badge-neutral">O ${days} dní</span>`;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td><div class="sub-item-cell"><div class="sub-item-icon" style="background-color:${sub.color||'#6366f1'}"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i></div><span>${escapeHtml(sub.name)}</span></div></td><td><span class="sub-badge-category">${escapeHtml(sub.category)}</span></td><td><strong>${formatMoney(sub.price)}</strong> <small class="text-subtle">/${sub.billingCycle==='monthly'?'mes.':'rok'}</small></td><td>${formatDateSK(sub.nextPaymentDate)}</td><td>${badgeHtml}</td>`;
                    tbody.appendChild(tr);
                });
            }
        }

        const categoryTotals = {};
        subscriptions.forEach(sub => {
            const cat = sub.category || 'Iné';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (sub.billingCycle === 'monthly' ? sub.price : sub.price / 12);
        });
        const catList = document.getElementById('dashboardCategoriesList');
        if (catList) {
            catList.innerHTML = '';
            Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]).forEach(cat => {
                const val = categoryTotals[cat];
                const pct = monthlyTotal > 0 ? Math.round((val / monthlyTotal) * 100) : 0;
                const div = document.createElement('div');
                div.className = 'category-item';
                div.innerHTML = `<div class="cat-item-top"><span class="cat-item-name"><i class="fa-solid ${getCategoryIcon(cat)}" style="color:${getCategoryColor(cat)};margin-right:6px;"></i>${cat} (${pct}%)</span><span class="cat-item-price">${formatMoney(val)}/mes.</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:${getCategoryColor(cat)};"></div></div>`;
                catList.appendChild(div);
            });
            if (!Object.keys(categoryTotals).length) {
                catList.innerHTML = `<p class="text-subtle" style="text-align:center;">Žiadne kategórie</p>`;
            }
        }
    }

    // ============================================================
    //  2. ZOZNAM PREDPLATNÝCH
    // ============================================================
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBySelect = document.getElementById('sortBySelect');
    searchInput?.addEventListener('input', renderSubscriptions);
    categoryFilter?.addEventListener('change', renderSubscriptions);
    sortBySelect?.addEventListener('change', renderSubscriptions);
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => switchView('add-subscription'));

    function renderSubscriptions() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selectedCat = categoryFilter ? categoryFilter.value : 'all';
        const sortBy = sortBySelect ? sortBySelect.value : 'nextPayment';

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
        if (!container) return;
        container.innerHTML = '';
        if (filtered.length === 0) {
            emptyState?.classList.remove('hidden');
            return;
        }
        emptyState?.classList.add('hidden');

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
    const dateInput = document.getElementById('subNextPaymentDate');
    if (dateInput) dateInput.value = getRelativeDate(30);

    subscriptionForm?.addEventListener('submit', async e => {
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
        if (dateInput) dateInput.value = getRelativeDate(30);
        showToast(`"${name}" bolo uložené ☁️`, 'success');
        switchView('subscriptions');
    });

    document.getElementById('cancelFormBtn')?.addEventListener('click', () => { subscriptionForm?.reset(); switchView('subscriptions'); });

    // ============================================================
    //  4. EDIT & DELETE MODALS
    // ============================================================
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    document.getElementById('closeEditModalBtn')?.addEventListener('click', () => editModal?.close());
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => editModal?.close());

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
        editModal?.showModal();
    }

    editForm?.addEventListener('submit', async e => {
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
        editModal?.close();
        showToast('Zmeny boli uložené a synchronizované ☁️', 'success');
    });

    const deleteModal = document.getElementById('deleteModal');
    document.getElementById('closeDeleteModalBtn')?.addEventListener('click', () => deleteModal?.close());
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => deleteModal?.close());

    function openDeleteModal(subId) {
        const sub = subscriptions.find(s => s.id === subId);
        if (!sub) return;
        deleteTargetId = subId;
        const targetNameEl = document.getElementById('deleteTargetName');
        if (targetNameEl) targetNameEl.textContent = sub.name;
        deleteModal?.showModal();
    }

    document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
        if (!deleteTargetId) return;
        await deleteSubscription(deleteTargetId);
        deleteTargetId = null;
        deleteModal?.close();
        showToast('Predplatné bolo odstránené ☁️', 'info');
    });

    // ============================================================
    //  5. KALKULAČKA ÚSPOR
    // ============================================================
    let allCalcSelected = false;
    document.getElementById('calcSelectAllBtn')?.addEventListener('click', () => {
        allCalcSelected = !allCalcSelected;
        if (allCalcSelected) { subscriptions.forEach(s => selectedCalcSubIds.add(s.id)); document.getElementById('calcSelectAllBtn').textContent = 'Odznačiť všetky'; }
        else { selectedCalcSubIds.clear(); document.getElementById('calcSelectAllBtn').textContent = 'Označiť všetky'; }
        renderCalculator();
    });

    function renderCalculator() {
        const container = document.getElementById('calcItemsContainer');
        if (!container) return;
        container.innerHTML = '';
        if (!subscriptions.length) { container.innerHTML = `<p class="text-subtle" style="text-align:center;">Zatiaľ nemáte žiadne predplatné pre výpočet.</p>`; return; }
        subscriptions.forEach(sub => {
            const isChecked = selectedCalcSubIds.has(sub.id);
            const mPrice = sub.billingCycle === 'monthly' ? sub.price : sub.price / 12;
            const item = document.createElement('div');
            item.className = 'calc-item';
            item.innerHTML = `<div class="calc-item-left"><input type="checkbox" class="calc-item-checkbox" ${isChecked?'checked':''} data-id="${sub.id}"><div class="calc-item-info"><strong>${escapeHtml(sub.name)}</strong><span>${escapeHtml(sub.category)}</span></div></div><div class="calc-item-price">${formatMoney(mPrice)}/mes.</div>`;
            item.addEventListener('click', e => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('.calc-item-checkbox');
                    if (cb) cb.checked = !cb.checked;
                }
                const cb = item.querySelector('.calc-item-checkbox');
                if (cb) {
                    if (cb.checked) selectedCalcSubIds.add(sub.id);
                    else selectedCalcSubIds.delete(sub.id);
                }
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
        const mSave = document.getElementById('calcMonthlySavings');
        const ySave = document.getElementById('calcYearlySavings');
        if (mSave) mSave.textContent = formatMoney(monthlySavings);
        if (ySave) ySave.textContent = formatMoney(yearlySavings);

        const targetsList = document.getElementById('calcTargetsList');
        if (targetsList) {
            targetsList.innerHTML = '';
            [{ name: 'Kino pre dvoch + pukance', price: 30, icon: 'fa-film' }, { name: 'Ročné predplatné knižnej aplikácie', price: 80, icon: 'fa-book' }, { name: 'Kvalitné bezdrôtové slúchadlá', price: 150, icon: 'fa-headphones' }, { name: 'Víkendový wellness pobyt', price: 300, icon: 'fa-spa' }, { name: 'Nový smartfón strednej triedy', price: 600, icon: 'fa-mobile-screen' }, { name: 'Letná dovolenka pri mori', price: 1200, icon: 'fa-plane' }].forEach(m => {
                const isAchieved = yearlySavings >= m.price;
                const div = document.createElement('div');
                div.className = `target-item ${isAchieved ? 'achieved' : ''}`;
                div.innerHTML = `<i class="fa-solid ${m.icon} target-icon"></i><div class="target-text">${m.name} (${formatMoney(m.price)})</div><div class="target-status">${isAchieved ? '<i class="fa-solid fa-check-circle text-success"></i> Dosiahnuté!' : 'Chýba ' + formatMoney(m.price - yearlySavings)}</div>`;
                targetsList.appendChild(div);
            });
        }
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
        const bottomBadge = document.getElementById('bottomNavNotificationBadge');
        if (!container) return;
        container.innerHTML = '';
        const within7 = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= 7; });
        if (within7.length > 0) {
            if (badge) { badge.textContent = within7.length; badge.classList.remove('hidden'); }
            if (bottomBadge) { bottomBadge.textContent = within7.length; bottomBadge.classList.remove('hidden'); }
        } else {
            if (badge) badge.classList.add('hidden');
            if (bottomBadge) bottomBadge.classList.add('hidden');
        }

        const filtered = subscriptions.filter(s => { const d = getDaysUntil(s.nextPaymentDate); return d >= 0 && d <= notificationDaysFilter; }).sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        if (!filtered.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-regular fa-bell-slash"></i><h3>Žiadne platby v najbližších ${notificationDaysFilter} dňoch</h3><p>${currentUser ? 'Všetky vaše platby sú v poriadku.' : 'Prihláste sa pre zobrazenie upozornení.'}</p></div>`;
            return;
        }

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
    //  7. EXPORT & IMPORT ZO ZÁLOHY (S USER_ID & MAZANÍM PRED IMPORTOM)
    // ============================================================
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        if (!subscriptions.length) { showToast('Nemáte žiadne dáta na export.', 'warning'); return; }
        let csv = '\uFEFF' + 'Názov služby;Suma (€);Frekvencia;Kategória;Spôsob platby;Dátum platby;Poznámka\n';
        subscriptions.forEach(s => { csv += `"${s.name}";"${s.price}";"${s.billingCycle==='monthly'?'Mesačne':'Ročne'}";"${s.category}";"${s.paymentMethod||''}";"${s.nextPaymentDate}";"${(s.notes||'').replace(/;/g,',')}"\n`; });
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url; a.download = `predplatne_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('CSV súbor bol stiahnutý!', 'success');
    });

    document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
        if (!subscriptions.length) { showToast('Nemáte žiadne dáta na export.', 'warning'); return; }
        const url = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(subscriptions, null, 2));
        const a = document.createElement('a');
        a.href = url; a.download = `predplatne_zaloha_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast('JSON záloha bola stiahnutá!', 'success');
    });

    document.getElementById('importJsonInput')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;

        const client = getSupabaseClient();
        if (!client) {
            showToast('Chyba: Supabase klient nie je inicializovaný.', 'error');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async evt => {
            try {
                // 1. Získaj aktuálneho používateľa
                const { data: { user }, error: userError } = await client.auth.getUser();
                if (userError || !user) {
                    showToast('Pre import zo zálohy sa musíte prihlásiť.', 'warning');
                    openAuthModal('login');
                    return;
                }
                currentUser = user;

                const parsed = JSON.parse(evt.target.result);
                if (!Array.isArray(parsed) || parsed.length === 0) {
                    showToast('Neplatný alebo prázdny formát JSON súboru (očakáva sa pole predplatných).', 'error');
                    return;
                }

                // 2. Mapovanie položiek zo zálohy s priradením user_id a generovaním nového unikátneho UUID
                const rowsToInsert = parsed.map(item => ({
                    ...appToDB(item, user.id),
                    id: generateId()
                }));

                // 3. Voliteľné prečistenie starých záznamov používateľa
                await client.from(TABLE).delete().eq('user_id', user.id);

                // 4. Bezpečný zápis cez čistý INSERT (vyhodnocuje len WITH CHECK, bez chyby USING expression)
                const { error: insertError } = await client
                    .from(TABLE)
                    .insert(rowsToInsert);

                if (insertError) {
                    console.error('Chyba pri insert do Supabase:', insertError);
                    showToast(`Chyba pri importe do Supabase: ${insertError.message || JSON.stringify(insertError)}`, 'error');
                    return;
                }

                // 5. Okamžitá obnova stavu UI priamo z databázy
                await initData();
                showToast(`Úspešne importovaných ${subscriptions.length} predplatných ☁️`, 'success');
                switchView('dashboard');

            } catch (err) {
                console.error('Import JSON error:', err);
                showToast(`Chyba pri spracovaní JSON: ${err.message || err}`, 'error');
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('resetDemoBtn')?.addEventListener('click', async () => {
        if (!currentUser) {
            openAuthModal('login');
            return;
        }
        if (confirm('Naozaj chcete obnoviť ukážkové predplatné? Všetky vaše existujúce dáta v Supabase budú nahradené.')) {
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
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: 'fa-check-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle', error: 'fa-circle-xmark' };
        toast.innerHTML = `<i class="fa-solid ${icons[type]||'fa-info-circle'}"></i> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

    // ============================================================
    //  INICIALIZÁCIA RELÁCIE A ON-AUTH-STATE-CHANGE
    // ============================================================
    const client = getSupabaseClient();
    if (client) {
        // 1. Zisti existujúcu reláciu
        try {
            const { data: sessionData } = await client.auth.getSession();
            currentUser = sessionData?.session?.user || null;
        } catch (e) {
            console.warn('Chyba načítania existujúcej relácie:', e);
            currentUser = null;
        }

        // 2. Počúvaj zmeny autentifikácie (prihlásenie, odhlásenie, token refresh)
        client.auth.onAuthStateChange(async (event, session) => {
            const previousUser = currentUser;
            currentUser = session?.user || null;
            updateUserProfileUI();

            if (event === 'SIGNED_IN' || (currentUser && !previousUser)) {
                updateStorageStatusBadge();
                await initData();
                subscribeToRealtime();
            } else if (event === 'SIGNED_OUT' || !currentUser) {
                storageMode = 'unauthenticated';
                subscriptions = [];
                updateStorageStatusBadge();
                updateAllViews();
            }
        });
    }

    // 3. Spusť aplikáciu
    await initData();
    if (currentUser) {
        subscribeToRealtime();
    } else {
        openAuthModal('login');
    }
    switchView('dashboard');
});
