/**
 * SPRÁVCA PREDPLATNÝCH (Subscription Manager)
 * Main Client Application Logic with Disk Storage & REST API
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let subscriptions = [];
    let currentView = 'dashboard';
    let deleteTargetId = null;
    let notificationDaysFilter = 7;
    let selectedCalcSubIds = new Set();
    let isServerConnected = false;

    const STORAGE_KEY = 'spravca_predplatnych_data';
    const API_BASE = '/api/subscriptions';

    const DEMO_SUBSCRIPTIONS = [
        {
            id: 'sub_demo_1',
            name: 'Netflix Premium',
            price: 17.99,
            billingCycle: 'monthly',
            category: 'Zábava',
            paymentMethod: 'Platebná karta',
            nextPaymentDate: getRelativeDate(3),
            color: '#e50914',
            notes: '4K Ultra HD rodinné konto',
            active: true
        },
        {
            id: 'sub_demo_2',
            name: 'Spotify Family',
            price: 10.99,
            billingCycle: 'monthly',
            category: 'Zábava',
            paymentMethod: 'PayPal',
            nextPaymentDate: getRelativeDate(11),
            color: '#1db954',
            notes: 'Pre 6 členov rodiny',
            active: true
        },
        {
            id: 'sub_demo_3',
            name: 'Optický Internet Telekom',
            price: 22.90,
            billingCycle: 'monthly',
            category: 'Domácnosť',
            paymentMethod: 'Bankový prevod',
            nextPaymentDate: getRelativeDate(1),
            color: '#e20074',
            notes: 'Rýchlosť 500/50 Mbps',
            active: true
        },
        {
            id: 'sub_demo_4',
            name: 'Posilňovňa GymBeam',
            price: 29.00,
            billingCycle: 'monthly',
            category: 'Zdravie',
            paymentMethod: 'Platebná karta',
            nextPaymentDate: getRelativeDate(6),
            color: '#f59e0b',
            notes: 'Mesačné členstvo bez viazanosti',
            active: true
        },
        {
            id: 'sub_demo_5',
            name: 'ChatGPT Plus (OpenAI)',
            price: 20.00,
            billingCycle: 'monthly',
            category: 'Nástroje',
            paymentMethod: 'Apple Pay',
            nextPaymentDate: getRelativeDate(18),
            color: '#10a37f',
            notes: 'GPT-4o a generovanie obrázkov',
            active: true
        },
        {
            id: 'sub_demo_6',
            name: 'Adobe Creative Cloud',
            price: 380.00,
            billingCycle: 'yearly',
            category: 'Práca',
            paymentMethod: 'Platebná karta',
            nextPaymentDate: getRelativeDate(45),
            color: '#ff0000',
            notes: 'Ročné predplatné pre grafiku',
            active: true
        },
        {
            id: 'sub_demo_7',
            name: 'iCloud+ 200GB',
            price: 2.99,
            billingCycle: 'monthly',
            category: 'Nástroje',
            paymentMethod: 'Apple Pay',
            nextPaymentDate: getRelativeDate(2),
            color: '#3b82f6',
            notes: 'Zálohovanie fotiek a iPhone',
            active: true
        }
    ];

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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateString);
        target.setHours(0, 0, 0, 0);
        const diffTime = target - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Storage Status UI
    function updateStorageStatusBadge() {
        const badge = document.getElementById('storageStatusBadge');
        const text = document.getElementById('storageStatusText');
        if (!badge || !text) return;

        if (isServerConnected) {
            badge.classList.remove('offline');
            badge.innerHTML = `<i class="fa-solid fa-hard-drive"></i> Uložené na disku (data/subscriptions.json)`;
        } else {
            badge.classList.add('offline');
            badge.innerHTML = `<i class="fa-solid fa-database"></i> Uložené v LocalStorage (Offline Režim)`;
        }
    }

    // API & Local Storage Operations
    async function loadData() {
        try {
            const res = await fetch(API_BASE, { method: 'GET', headers: { 'Accept': 'application/json' } });
            if (res.ok) {
                const data = await res.json();
                subscriptions = Array.isArray(data) ? data : [];
                isServerConnected = true;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                updateStorageStatusBadge();
                updateAllViews();
                return;
            }
        } catch (e) {
            console.warn('Backend API nedostupné, prepínam na LocalStorage:', e.message);
        }

        // Fallback to LocalStorage
        isServerConnected = false;
        updateStorageStatusBadge();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                subscriptions = JSON.parse(raw);
            } catch (err) {
                subscriptions = [...DEMO_SUBSCRIPTIONS];
            }
        } else {
            subscriptions = [...DEMO_SUBSCRIPTIONS];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
        }
        updateAllViews();
    }

    async function addSubscriptionAPI(newSub) {
        if (isServerConnected) {
            try {
                const res = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSub)
                });
                if (res.ok) {
                    subscriptions.push(newSub);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                    updateAllViews();
                    return true;
                }
            } catch (e) {
                console.error('API Error:', e);
            }
        }

        // Local fallback
        subscriptions.push(newSub);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
        updateAllViews();
        return true;
    }

    async function updateSubscriptionAPI(updatedSub) {
        if (isServerConnected) {
            try {
                const res = await fetch(`${API_BASE}/${updatedSub.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedSub)
                });
                if (res.ok) {
                    const idx = subscriptions.findIndex(s => s.id === updatedSub.id);
                    if (idx !== -1) subscriptions[idx] = updatedSub;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                    updateAllViews();
                    return true;
                }
            } catch (e) {
                console.error('API Error:', e);
            }
        }

        // Local fallback
        const idx = subscriptions.findIndex(s => s.id === updatedSub.id);
        if (idx !== -1) subscriptions[idx] = updatedSub;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
        updateAllViews();
        return true;
    }

    async function deleteSubscriptionAPI(subId) {
        if (isServerConnected) {
            try {
                const res = await fetch(`${API_BASE}/${subId}`, { method: 'DELETE' });
                if (res.ok) {
                    subscriptions = subscriptions.filter(s => s.id !== subId);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                    updateAllViews();
                    return true;
                }
            } catch (e) {
                console.error('API Error:', e);
            }
        }

        // Local fallback
        subscriptions = subscriptions.filter(s => s.id !== subId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
        updateAllViews();
        return true;
    }

    async function resetDemoDataAPI() {
        if (isServerConnected) {
            try {
                const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    subscriptions = data;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                    updateAllViews();
                    return true;
                }
            } catch (e) {
                console.error('API Error:', e);
            }
        }

        subscriptions = JSON.parse(JSON.stringify(DEMO_SUBSCRIPTIONS));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
        updateAllViews();
        return true;
    }

    // UI View Navigation
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
            if (link.getAttribute('data-view') === viewName) link.classList.add('active');
            else link.classList.remove('active');
        });

        viewSections.forEach(section => {
            if (section.id === `view-${viewName}`) section.classList.add('active');
            else section.classList.remove('active');
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

    mobileToggleBtn.addEventListener('click', () => {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
    });

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(link.getAttribute('data-view'));
        });
    });

    document.getElementById('quickAddBtn').addEventListener('click', () => switchView('add-subscription'));
    document.getElementById('goToSubscriptionsBtn')?.addEventListener('click', () => switchView('subscriptions'));
    document.getElementById('viewAlertsBtn')?.addEventListener('click', () => switchView('notifications'));

    // Calculations
    function getTotals() {
        let monthlyTotal = 0;
        let yearlyTotal = 0;

        subscriptions.forEach(sub => {
            const price = parseFloat(sub.price) || 0;
            if (sub.billingCycle === 'monthly') {
                monthlyTotal += price;
                yearlyTotal += price * 12;
            } else if (sub.billingCycle === 'yearly') {
                monthlyTotal += price / 12;
                yearlyTotal += price;
            }
        });

        return { monthlyTotal, yearlyTotal };
    }

    function updateAllViews() {
        const { monthlyTotal, yearlyTotal } = getTotals();
        document.getElementById('sidebarMonthlyTotal').textContent = formatMoney(monthlyTotal);

        renderDashboard();
        renderSubscriptions();
        renderCalculator();
        renderNotifications();
    }

    // 1. RENDER DASHBOARD
    function renderDashboard() {
        const { monthlyTotal, yearlyTotal } = getTotals();

        document.getElementById('dashboardMonthly').textContent = formatMoney(monthlyTotal);
        document.getElementById('dashboardYearly').textContent = formatMoney(yearlyTotal);
        document.getElementById('dashboardCount').textContent = subscriptions.length;

        const sorted = [...subscriptions].sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        const dashboardNextPayment = document.getElementById('dashboardNextPayment');
        const dashboardNextPaymentSubtext = document.getElementById('dashboardNextPaymentSubtext');

        if (sorted.length > 0) {
            const nearest = sorted[0];
            const days = getDaysUntil(nearest.nextPaymentDate);
            dashboardNextPayment.textContent = `${nearest.name} (${formatMoney(nearest.price)})`;
            
            if (days === 0) {
                dashboardNextPaymentSubtext.textContent = 'Splatné dnes!';
                dashboardNextPaymentSubtext.style.color = 'var(--danger)';
            } else if (days === 1) {
                dashboardNextPaymentSubtext.textContent = 'Splatné zajtra!';
                dashboardNextPaymentSubtext.style.color = 'var(--warning)';
            } else if (days < 0) {
                dashboardNextPaymentSubtext.textContent = `Po splatnosti (${Math.abs(days)} dní)`;
                dashboardNextPaymentSubtext.style.color = 'var(--danger)';
            } else {
                dashboardNextPaymentSubtext.textContent = `O ${days} dní (${formatDateSK(nearest.nextPaymentDate)})`;
                dashboardNextPaymentSubtext.style.color = 'var(--text-subtle)';
            }
        } else {
            dashboardNextPayment.textContent = 'Žiadne';
            dashboardNextPaymentSubtext.textContent = 'Nemáte aktívne predplatné';
        }

        const imminentPayments = subscriptions.filter(sub => {
            const days = getDaysUntil(sub.nextPaymentDate);
            return days >= 0 && days <= 7;
        });

        const alertBanner = document.getElementById('dashboardAlertBanner');
        if (imminentPayments.length > 0) {
            alertBanner.classList.remove('hidden');
            document.getElementById('alertBannerTitle').textContent = `Upozornenie: Blíži sa ${imminentPayments.length} platba!`;
            document.getElementById('alertBannerText').textContent = `Máte platby splatné v najbližších 7 dňoch v celkovej hodnote ${formatMoney(imminentPayments.reduce((acc, curr) => acc + curr.price, 0))}.`;
        } else {
            alertBanner.classList.add('hidden');
        }

        const upcomingTableBody = document.getElementById('dashboardUpcomingTable');
        const upcomingEmpty = document.getElementById('dashboardUpcomingEmpty');
        upcomingTableBody.innerHTML = '';

        if (sorted.length === 0) {
            upcomingEmpty.classList.remove('hidden');
        } else {
            upcomingEmpty.classList.add('hidden');
            sorted.slice(0, 5).forEach(sub => {
                const days = getDaysUntil(sub.nextPaymentDate);
                let badgeHtml = '';
                if (days < 0) badgeHtml = `<span class="badge badge-danger">Po splatnosti</span>`;
                else if (days === 0) badgeHtml = `<span class="badge badge-danger">Dnes</span>`;
                else if (days <= 3) badgeHtml = `<span class="badge badge-warning">O ${days} dni</span>`;
                else badgeHtml = `<span class="badge badge-neutral">O ${days} dní</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="sub-item-cell">
                            <div class="sub-item-icon" style="background-color: ${sub.color || '#6366f1'}">
                                <i class="fa-solid ${getCategoryIcon(sub.category)}"></i>
                            </div>
                            <span>${escapeHtml(sub.name)}</span>
                        </div>
                    </td>
                    <td><span class="sub-badge-category">${escapeHtml(sub.category)}</span></td>
                    <td><strong>${formatMoney(sub.price)}</strong> <small class="text-subtle">/${sub.billingCycle === 'monthly' ? 'mes.' : 'rok'}</small></td>
                    <td>${formatDateSK(sub.nextPaymentDate)}</td>
                    <td>${badgeHtml}</td>
                `;
                upcomingTableBody.appendChild(tr);
            });
        }

        const categoryTotals = {};
        subscriptions.forEach(sub => {
            const cat = sub.category || 'Iné';
            const mPrice = sub.billingCycle === 'monthly' ? sub.price : sub.price / 12;
            categoryTotals[cat] = (categoryTotals[cat] || 0) + mPrice;
        });

        const categoriesList = document.getElementById('dashboardCategoriesList');
        categoriesList.innerHTML = '';

        const catKeys = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        if (catKeys.length === 0) {
            categoriesList.innerHTML = `<p class="text-subtle" style="text-align: center;">Žiadne dáta</p>`;
        } else {
            catKeys.forEach(cat => {
                const val = categoryTotals[cat];
                const pct = monthlyTotal > 0 ? Math.round((val / monthlyTotal) * 100) : 0;
                const catColor = getCategoryColor(cat);

                const div = document.createElement('div');
                div.className = 'category-item';
                div.innerHTML = `
                    <div class="cat-item-top">
                        <span class="cat-item-name"><i class="fa-solid ${getCategoryIcon(cat)}" style="color: ${catColor}; margin-right: 6px;"></i> ${cat} (${pct}%)</span>
                        <span class="cat-item-price">${formatMoney(val)}/mes.</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${pct}%; background: ${catColor};"></div>
                    </div>
                `;
                categoriesList.appendChild(div);
            });
        }
    }

    // 2. RENDER SUBSCRIPTIONS LIST
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

        let filtered = subscriptions.filter(sub => {
            const matchQuery = sub.name.toLowerCase().includes(query) || (sub.notes && sub.notes.toLowerCase().includes(query));
            const matchCat = selectedCat === 'all' || sub.category === selectedCat;
            return matchQuery && matchCat;
        });

        filtered.sort((a, b) => {
            if (sortBy === 'nextPayment') return new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate);
            if (sortBy === 'priceDesc') {
                const priceA = a.billingCycle === 'monthly' ? a.price : a.price / 12;
                const priceB = b.billingCycle === 'monthly' ? b.price : b.price / 12;
                return priceB - priceA;
            }
            if (sortBy === 'priceAsc') {
                const priceA = a.billingCycle === 'monthly' ? a.price : a.price / 12;
                const priceB = b.billingCycle === 'monthly' ? b.price : b.price / 12;
                return priceA - priceB;
            }
            if (sortBy === 'nameAsc') return a.name.localeCompare(b.name, 'sk');
            return 0;
        });

        const container = document.getElementById('subscriptionsContainer');
        const emptyState = document.getElementById('subscriptionsEmpty');
        container.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            filtered.forEach(sub => {
                const days = getDaysUntil(sub.nextPaymentDate);
                const card = document.createElement('div');
                card.className = 'sub-card glass-card';
                card.innerHTML = `
                    <div class="sub-card-top">
                        <span class="sub-badge-category"><i class="fa-solid ${getCategoryIcon(sub.category)}"></i> ${escapeHtml(sub.category)}</span>
                        <span class="badge ${days <= 3 ? 'badge-warning' : 'badge-neutral'}">
                            ${days === 0 ? 'Dnes' : days > 0 ? `O ${days} dní` : 'Po splatnosti'}
                        </span>
                    </div>

                    <div class="sub-card-title-group">
                        <div class="sub-card-icon" style="background-color: ${sub.color || '#6366f1'}">
                            <i class="fa-solid ${getCategoryIcon(sub.category)}"></i>
                        </div>
                        <div>
                            <h3 class="sub-card-name">${escapeHtml(sub.name)}</h3>
                            <span class="sub-card-price-cycle">${sub.paymentMethod || 'Platba'}</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <span class="sub-card-price-tag">${formatMoney(sub.price)}</span>
                        <span class="sub-card-price-cycle">/${sub.billingCycle === 'monthly' ? 'mesačne' : 'ročne'}</span>
                    </div>

                    <div class="sub-card-details">
                        <div class="sub-detail-row">
                            <span class="sub-detail-label">Ďalšia platba:</span>
                            <span class="sub-detail-value">${formatDateSK(sub.nextPaymentDate)}</span>
                        </div>
                        <div class="sub-detail-row">
                            <span class="sub-detail-label">Ročné náklady:</span>
                            <span class="sub-detail-value">${formatMoney(sub.billingCycle === 'monthly' ? sub.price * 12 : sub.price)}</span>
                        </div>
                        ${sub.notes ? `
                        <div class="sub-detail-row">
                            <span class="sub-detail-label">Poznámka:</span>
                            <span class="sub-detail-value text-truncate" title="${escapeHtml(sub.notes)}">${escapeHtml(sub.notes)}</span>
                        </div>` : ''}
                    </div>

                    <div class="sub-card-actions">
                        <button class="btn btn-secondary btn-sm edit-sub-btn" data-id="${sub.id}">
                            <i class="fa-solid fa-pen"></i> Upraviť
                        </button>
                        <button class="btn btn-danger-outline btn-sm delete-sub-btn" data-id="${sub.id}">
                            <i class="fa-solid fa-trash"></i> Zmazať
                        </button>
                    </div>
                `;
                container.appendChild(card);
            });

            document.querySelectorAll('.edit-sub-btn').forEach(btn => {
                btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-id')));
            });

            document.querySelectorAll('.delete-sub-btn').forEach(btn => {
                btn.addEventListener('click', () => openDeleteModal(btn.getAttribute('data-id')));
            });
        }
    }

    // 3. ADD SUBSCRIPTION FORM
    const subscriptionForm = document.getElementById('subscriptionForm');
    const cancelFormBtn = document.getElementById('cancelFormBtn');
    document.getElementById('subNextPaymentDate').value = getRelativeDate(30);

    subscriptionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('subName').value.trim();
        const price = parseFloat(document.getElementById('subPrice').value);
        const billingCycle = document.getElementById('subBillingCycle').value;
        const category = document.getElementById('subCategory').value;
        const paymentMethod = document.getElementById('subPaymentMethod').value;
        const nextPaymentDate = document.getElementById('subNextPaymentDate').value;
        const color = document.getElementById('subColor').value;
        const notes = document.getElementById('subNotes').value.trim();

        if (!name || isNaN(price) || !nextPaymentDate) {
            showToast('Prosím, vyplňte všetky povinné polia.', 'error');
            return;
        }

        const newSub = {
            id: 'sub_' + Date.now(),
            name,
            price,
            billingCycle,
            category,
            paymentMethod,
            nextPaymentDate,
            color,
            notes,
            active: true
        };

        await addSubscriptionAPI(newSub);
        subscriptionForm.reset();
        document.getElementById('subNextPaymentDate').value = getRelativeDate(30);

        showToast(`Predplatné "${name}" bolo uložené do súboru na disku!`, 'success');
        switchView('subscriptions');
    });

    cancelFormBtn.addEventListener('click', () => {
        subscriptionForm.reset();
        switchView('subscriptions');
    });

    // 4. EDIT & DELETE MODALS
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    const deleteModal = document.getElementById('deleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');

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

    closeEditModalBtn.addEventListener('click', () => editModal.close());
    cancelEditBtn.addEventListener('click', () => editModal.close());

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editSubId').value;
        const subIndex = subscriptions.findIndex(s => s.id === id);
        if (subIndex === -1) return;

        const updated = {
            ...subscriptions[subIndex],
            name: document.getElementById('editSubName').value.trim(),
            price: parseFloat(document.getElementById('editSubPrice').value),
            billingCycle: document.getElementById('editSubBillingCycle').value,
            category: document.getElementById('editSubCategory').value,
            paymentMethod: document.getElementById('editSubPaymentMethod').value,
            nextPaymentDate: document.getElementById('editSubNextPaymentDate').value,
            color: document.getElementById('editSubColor').value,
            notes: document.getElementById('editSubNotes').value.trim()
        };

        await updateSubscriptionAPI(updated);
        editModal.close();
        showToast('Zmeny boli úspešne uložené na disk.', 'success');
    });

    function openDeleteModal(subId) {
        const sub = subscriptions.find(s => s.id === subId);
        if (!sub) return;

        deleteTargetId = subId;
        document.getElementById('deleteTargetName').textContent = sub.name;
        deleteModal.showModal();
    }

    closeDeleteModalBtn.addEventListener('click', () => deleteModal.close());
    cancelDeleteBtn.addEventListener('click', () => deleteModal.close());

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!deleteTargetId) return;
        await deleteSubscriptionAPI(deleteTargetId);
        deleteTargetId = null;
        deleteModal.close();
        showToast('Predplatné bolo odstránené z diskového súboru.', 'info');
    });

    // 5. RENDER CALCULATOR ("ČO AK...")
    const calcSelectAllBtn = document.getElementById('calcSelectAllBtn');
    let allCalcSelected = false;

    calcSelectAllBtn.addEventListener('click', () => {
        allCalcSelected = !allCalcSelected;
        if (allCalcSelected) {
            subscriptions.forEach(s => selectedCalcSubIds.add(s.id));
            calcSelectAllBtn.textContent = 'Odznačiť všetky';
        } else {
            selectedCalcSubIds.clear();
            calcSelectAllBtn.textContent = 'Označiť všetky';
        }
        renderCalculator();
    });

    function renderCalculator() {
        const container = document.getElementById('calcItemsContainer');
        container.innerHTML = '';

        if (subscriptions.length === 0) {
            container.innerHTML = `<p class="text-subtle" style="text-align: center;">Žiadne predplatné pre výpočet.</p>`;
        } else {
            subscriptions.forEach(sub => {
                const isChecked = selectedCalcSubIds.has(sub.id);
                const mPrice = sub.billingCycle === 'monthly' ? sub.price : sub.price / 12;

                const item = document.createElement('div');
                item.className = 'calc-item';
                item.innerHTML = `
                    <div class="calc-item-left">
                        <input type="checkbox" class="calc-item-checkbox" ${isChecked ? 'checked' : ''} data-id="${sub.id}">
                        <div class="calc-item-info">
                            <strong>${escapeHtml(sub.name)}</strong>
                            <span>${escapeHtml(sub.category)}</span>
                        </div>
                    </div>
                    <div class="calc-item-price">${formatMoney(mPrice)}/mes.</div>
                `;

                item.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        const cb = item.querySelector('.calc-item-checkbox');
                        cb.checked = !cb.checked;
                    }
                    const cb = item.querySelector('.calc-item-checkbox');
                    if (cb.checked) selectedCalcSubIds.add(sub.id);
                    else selectedCalcSubIds.delete(sub.id);
                    updateSavingsCalculations();
                });

                container.appendChild(item);
            });
        }

        updateSavingsCalculations();
    }

    function updateSavingsCalculations() {
        let monthlySavings = 0;
        let yearlySavings = 0;

        subscriptions.forEach(sub => {
            if (selectedCalcSubIds.has(sub.id)) {
                const price = parseFloat(sub.price) || 0;
                if (sub.billingCycle === 'monthly') {
                    monthlySavings += price;
                    yearlySavings += price * 12;
                } else {
                    monthlySavings += price / 12;
                    yearlySavings += price;
                }
            }
        });

        document.getElementById('calcMonthlySavings').textContent = formatMoney(monthlySavings);
        document.getElementById('calcYearlySavings').textContent = formatMoney(yearlySavings);

        const targetsList = document.getElementById('calcTargetsList');
        targetsList.innerHTML = '';

        const MILESTONES = [
            { name: 'Kino pre dvoch + pukance', price: 30, icon: 'fa-film' },
            { name: 'Ročné predplatné knižnej aplikácie', price: 80, icon: 'fa-book' },
            { name: 'Kvalitné bezdrôtové slúchadlá', price: 150, icon: 'fa-headphones' },
            { name: 'Víkendový wellness pobyt', price: 300, icon: 'fa-spa' },
            { name: 'Nový smartfón strednej triedy', price: 600, icon: 'fa-mobile-screen' },
            { name: 'Letná dovolenka pri mori', price: 1200, icon: 'fa-plane' }
        ];

        MILESTONES.forEach(m => {
            const isAchieved = yearlySavings >= m.price;
            const div = document.createElement('div');
            div.className = `target-item ${isAchieved ? 'achieved' : ''}`;
            div.innerHTML = `
                <i class="fa-solid ${m.icon} target-icon"></i>
                <div class="target-text">${m.name} (${formatMoney(m.price)})</div>
                <div class="target-status">${isAchieved ? '<i class="fa-solid fa-check-circle text-success"></i> Dosiahnuté!' : 'Chýba ' + formatMoney(m.price - yearlySavings)}</div>
            `;
            targetsList.appendChild(div);
        });
    }

    // 6. RENDER NOTIFICATIONS VIEW
    const notifButtons = document.querySelectorAll('.days-filter-group button');
    notifButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            notifButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            notificationDaysFilter = parseInt(btn.getAttribute('data-days'));
            renderNotifications();
        });
    });

    function renderNotifications() {
        const container = document.getElementById('notificationsList');
        const badge = document.getElementById('navNotificationBadge');
        container.innerHTML = '';

        const todayUpcoming = subscriptions.filter(sub => {
            const days = getDaysUntil(sub.nextPaymentDate);
            return days >= 0 && days <= 7;
        });

        if (todayUpcoming.length > 0) {
            badge.textContent = todayUpcoming.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        const filtered = subscriptions.filter(sub => {
            const days = getDaysUntil(sub.nextPaymentDate);
            return days >= 0 && days <= notificationDaysFilter;
        }).sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-bell-slash"></i>
                    <h3>Žiadne platby v najbližších ${notificationDaysFilter} dňoch</h3>
                    <p>Všetky vaše platby sú v poriadku.</p>
                </div>
            `;
        } else {
            filtered.forEach(sub => {
                const days = getDaysUntil(sub.nextPaymentDate);
                let dayText = '';
                let badgeClass = 'badge-neutral';

                if (days === 0) { dayText = 'Splatné dnes!'; badgeClass = 'badge-danger'; }
                else if (days === 1) { dayText = 'Splatné zajtra!'; badgeClass = 'badge-warning'; }
                else { dayText = `O ${days} dní (${formatDateSK(sub.nextPaymentDate)})`; }

                const div = document.createElement('div');
                div.className = 'notif-item';
                div.innerHTML = `
                    <div class="notif-left">
                        <div class="notif-icon-badge" style="background-color: ${sub.color || '#6366f1'}">
                            <i class="fa-solid ${getCategoryIcon(sub.category)}"></i>
                        </div>
                        <div class="notif-info">
                            <h4>${escapeHtml(sub.name)}</h4>
                            <p>${escapeHtml(sub.category)} • ${sub.paymentMethod || 'Platba'}</p>
                        </div>
                    </div>
                    <div class="notif-right">
                        <div class="notif-price">${formatMoney(sub.price)}</div>
                        <span class="badge ${badgeClass}">${dayText}</span>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    }

    // 7. EXPORT & BACKUP LOGIC
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('importJsonInput').addEventListener('change', importJSON);
    document.getElementById('resetDemoBtn').addEventListener('click', resetDemoData);

    function exportCSV() {
        if (subscriptions.length === 0) {
            showToast('Nemáte žiadne dáta na export.', 'warning');
            return;
        }

        let csvContent = '\uFEFF';
        csvContent += 'Názov služby;Suma (€);Frekvencia;Kategória;Spôsob platby;Dátum nasledujúcej platby;Poznámka\n';

        subscriptions.forEach(sub => {
            const freq = sub.billingCycle === 'monthly' ? 'Mesačne' : 'Ročne';
            const notes = (sub.notes || '').replace(/;/g, ',');
            csvContent += `"${sub.name}";"${sub.price}";"${freq}";"${sub.category}";"${sub.paymentMethod || ''}";"${sub.nextPaymentDate}";"${notes}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `predplatne_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('CSV súbor bol úspešne stiahnutý!', 'success');
    }

    function exportJSON() {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(subscriptions, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', dataStr);
        link.setAttribute('download', `predplatne_zaloha_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('JSON záloha bola úspešne stiahnutá!', 'success');
    }

    async function importJSON(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                if (Array.isArray(parsed)) {
                    subscriptions = parsed;
                    if (isServerConnected) {
                        await fetch(`${API_BASE}/import`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(subscriptions)
                        });
                    }
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
                    updateAllViews();
                    showToast('Dáta boli importované a uložené na disk!', 'success');
                    switchView('dashboard');
                } else {
                    showToast('Neplatný formát JSON súboru.', 'error');
                }
            } catch (err) {
                showToast('Chyba pri čítaní JSON súboru.', 'error');
            }
        };
        reader.readAsText(file);
    }

    async function resetDemoData() {
        if (confirm('Naozaj chcete obnoviť ukážkové predplatné? Všetky vaše vlastné úpravy v súbore na disku budú nahradené.')) {
            await resetDemoDataAPI();
            showToast('Ukážkové dáta boli obnovené na disku.', 'info');
            switchView('dashboard');
        }
    }

    // Category Helpers
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

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'warning') icon = 'fa-exclamation-circle';
        if (type === 'error') icon = 'fa-circle-xmark';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // INITIALIZATION
    loadData();
    switchView('dashboard');
});
