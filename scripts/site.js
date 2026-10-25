import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const page = document.body.dataset.page;
let pendingHomeOfficialsScroll = false;
const supabaseUrl = window.BSPIS_SUPABASE_URL;
const supabaseKey = window.BSPIS_SUPABASE_ANON_KEY;
const configured = supabaseUrl && !supabaseUrl.includes('YOUR_PROJECT_REF')
    && supabaseKey && !supabaseKey.includes('YOUR_SUPABASE');
const supabase = configured ? createClient(supabaseUrl, supabaseKey) : null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function imageUrl(path, folder) {
    if (!path) return 'assets/images/officials/vacant.jpg';
    if (/^https?:\/\//i.test(path)) return path;
    return `assets/images/${folder}/${String(path).replace(/^\/+/, '')}`;
}

function showError(target, error) {
    if (!target) return;
    target.textContent = error?.message || 'Something went wrong. Please try again.';
    target.hidden = false;
}

async function getPublicOfficials() {
    const { data, error } = await supabase
        .from('officials')
        .select('id,name,position,group_name,position_rank,description,image')
        .order('group_name').order('position_rank').order('name');
    if (error) throw error;
    return data;
}

function officialPositionLabel(official) {
    const rank = Number(official.position_rank);
    const position = String(official.position || '').trim();
    if (rank >= 4 && rank <= 10) {
        const isYouthCouncil = /sangguniang kabataan|\bsk\b/i.test(official.group_name || '')
            || /^sk\s+kagawad/i.test(position);
        return `${isYouthCouncil ? 'SK ' : ''}Kagawad ${rank - 3}`;
    }
    return position;
}

function renderOfficials(officials, container) {
    const groups = officials.reduce((map, official) => {
        const records = map.get(official.group_name) || [];
        records.push(official);
        map.set(official.group_name, records);
        return map;
    }, new Map());
    const fixedGroups = ['Barangay Council', 'Sangguniang Kabataan'];
    fixedGroups.forEach(group => {
        if (!groups.has(group)) groups.set(group, []);
    });
    const orderedGroups = [
        ...fixedGroups,
        ...[...groups.keys()].filter(group => !fixedGroups.includes(group)).sort((left, right) => left.localeCompare(right))
    ];
    const officialCard = (official, position) => {
        const label = official ? officialPositionLabel(official) : position;
        return `<article class="public-official-card ${official ? 'public-official-card--occupied' : 'public-official-card--empty'}">
            <img src="${escapeHtml(imageUrl(official?.image || '', 'officials'))}" alt="${official ? escapeHtml(label) : ''}">
            <div class="public-official-card-copy">
                <small>${escapeHtml(label)}</small>
                <h3>${escapeHtml(official?.name || 'Vacant')}</h3>
                ${official?.description ? `<p>${escapeHtml(official.description)}</p>` : ''}
            </div>
        </article>`;
    };
    const renderGroup = group => {
        const records = groups.get(group);
        const isYouthCouncil = /sangguniang kabataan|\bsk\b/i.test(group || '');
        const chairmanTitle = isYouthCouncil ? 'SK Chairperson' : 'Barangay Captain';
        const byRank = rank => records.find(official => Number(official.position_rank) === rank);
        const assignedCouncilors = new Set();
        const councilorSlots = Array.from({ length: 7 }, (_, index) => {
            const rank = index + 4;
            const official = byRank(rank);
            if (official) assignedCouncilors.add(official.id);
            return officialCard(official, `${isYouthCouncil ? 'SK ' : ''}Kagawad ${index + 1}`);
        });
        const extraOfficials = records.filter(official => {
            const rank = Number(official.position_rank);
            return rank > 10 || (rank >= 4 && rank <= 10 && !assignedCouncilors.has(official.id));
        });
        const chart = fixedGroups.includes(group) ? `
            <div class="public-org-chart">
                <section class="public-chart-level">
                    <h3 class="public-tier-label">${chairmanTitle}</h3>
                    <div class="public-chart-grid public-chart-grid--top">${officialCard(byRank(1), chairmanTitle)}</div>
                </section>
                <div class="public-chart-connector" aria-hidden="true"></div>
                <section class="public-chart-level">
                    <h3 class="public-tier-label">Secretary &amp; Treasurer</h3>
                    <div class="public-chart-grid public-chart-grid--middle">
                        ${officialCard(byRank(2), 'Secretary')}
                        ${officialCard(byRank(3), 'Treasurer')}
                    </div>
                </section>
                <div class="public-chart-connector" aria-hidden="true"></div>
                <section class="public-chart-level">
                    <h3 class="public-tier-label">${isYouthCouncil ? 'SK Kagawad Positions' : 'Kagawad Positions'}</h3>
                    <div class="public-chart-grid">${councilorSlots.join('')}</div>
                    ${extraOfficials.length ? `<div class="public-chart-grid public-chart-grid--extras">
                        ${extraOfficials.map(official => officialCard(official, officialPositionLabel(official))).join('')}
                    </div>` : ''}
                </section>
            </div>` : `
            <div class="public-org-chart">
                <section class="public-chart-level">
                    <div class="public-chart-grid">
                        ${records.map(official => officialCard(official, officialPositionLabel(official))).join('')}
                    </div>
                </section>
            </div>`;
        return `<section class="public-official-group">
            <div class="public-official-group-heading">
                <h2>${escapeHtml(group || 'Other')}</h2><span>${records.length} profiles</span>
            </div>
            ${chart}
        </section>`;
    };
    container.innerHTML = orderedGroups.map(renderGroup).join('');
}

async function loadOfficials() {
    const containers = [
        document.getElementById('officials-list'),
        document.getElementById('home-officials')
    ].filter(Boolean);
    if (!containers.length) return;
    try {
        const officials = await getPublicOfficials();
        containers.forEach(container => renderOfficials(officials, container));
        if (pendingHomeOfficialsScroll) {
            pendingHomeOfficialsScroll = false;
            scrollToHomeOfficials();
        }
    } catch (error) {
        containers.forEach(container => showError(container, error));
    }
}

function scrollToHomeOfficials() {
    const section = document.getElementById('officials');
    const firstGroup = document.querySelector('#home-officials .public-official-group');
    if (!section || !firstGroup) {
        pendingHomeOfficialsScroll = true;
        return;
    }
    section?.classList.remove('officials-focus');
    void section?.offsetWidth;
    section?.classList.add('officials-focus');
    section.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
    });
    window.setTimeout(() => section?.classList.remove('officials-focus'), 1800);
}

async function loadAnnouncements() {
    const container = document.getElementById('announcement-list');
    if (!container) return;
    const { data, error } = await supabase.from('announcements')
        .select('id,title,message,image,publish_date,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (error) return showError(container, error);
    if (!data.length) {
        container.innerHTML = `<div class="announcement-empty-state">
            <strong>No announcements published yet.</strong>
            <span>Please check back soon for the latest barangay updates.</span>
        </div>`;
        return;
    }
    const preview = message => {
        const plainText = String(message || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        return plainText.length > 150 ? `${plainText.slice(0, 147)}...` : plainText;
    };
    const formatDate = value => {
        if (!value) return 'Date unavailable';
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? 'Date unavailable'
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    container.innerHTML = `${data.length ? `<div class="announcement-feed-heading">
        <div><p class="section-kicker">Latest from the barangay</p><h2>Community notices</h2></div>
        <span class="announcement-count-badge">${data.length} published</span>
    </div>` : ''}<div class="announcement-list">${data.map((item, index) => `
        <article class="announcement-card">
            <div class="announcement-media">
                ${item.image
                    ? `<button class="announcement-image-button" type="button" data-announcement-open="${index}" aria-label="View announcement: ${escapeHtml(item.title)}"><img src="${escapeHtml(imageUrl(item.image, 'announcements'))}" alt=""></button>`
                    : '<div class="announcement-no-image">Barangay update</div>'}
            </div>
            <div class="announcement-card-content">
            <div class="announcement-card-meta">
                <time class="announcement-date" datetime="${escapeHtml(item.publish_date || '')}">${escapeHtml(formatDate(item.publish_date))}</time>
            </div>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(preview(item.message))}</p>
            </div>
        </article>`).join('')}</div>`;

    const viewer = document.createElement('section');
    viewer.className = 'announcement-viewer';
    viewer.hidden = true;
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Announcement details');
    viewer.innerHTML = `<div class="announcement-viewer-panel">
        <button class="announcement-viewer-close" type="button" aria-label="Close announcement">×</button>
        <div class="announcement-viewer-image"><img alt=""></div>
        <div class="announcement-viewer-content">
            <time class="announcement-date"></time>
            <h2></h2>
            <p></p>
        </div>
    </div>`;
    document.body.append(viewer);

    const closeButton = viewer.querySelector('.announcement-viewer-close');
    let lastTrigger = null;
    const closeViewer = () => {
        viewer.hidden = true;
        document.body.classList.remove('announcement-viewer-open');
        lastTrigger?.focus();
    };
    container.addEventListener('click', event => {
        const trigger = event.target.closest('[data-announcement-open]');
        if (!trigger) return;
        const item = data[Number(trigger.dataset.announcementOpen)];
        if (!item) return;
        lastTrigger = trigger;
        const image = viewer.querySelector('.announcement-viewer-image img');
        image.src = imageUrl(item.image, 'announcements');
        image.alt = item.title;
        viewer.querySelector('time').textContent = formatDate(item.publish_date);
        viewer.querySelector('time').dateTime = item.publish_date || '';
        viewer.querySelector('h2').textContent = item.title;
        viewer.querySelector('.announcement-viewer-content p').textContent = item.message;
        viewer.hidden = false;
        document.body.classList.add('announcement-viewer-open');
        closeButton.focus();
    });
    closeButton.addEventListener('click', closeViewer);
    viewer.addEventListener('click', event => {
        if (event.target === viewer) closeViewer();
    });
    document.addEventListener('keydown', event => {
        if (viewer.hidden) return;
        if (event.key === 'Escape') closeViewer();
        if (event.key === 'Tab') {
            event.preventDefault();
            closeButton.focus();
        }
    });
}

async function loadResidentPopulation() {
    const container = document.getElementById('public-resident-population');
    if (!container) return;
    const status = container.querySelector('.resident-population-status');
    const grid = container.querySelector('.resident-population-grid');
    try {
        const { data, error } = await supabase.rpc('get_public_resident_population');
        if (error) throw error;
        const values = [
            data?.total,
            data?.puroks?.['1'],
            data?.puroks?.['2'],
            data?.puroks?.['3']
        ];
        if (values.some(value => !Number.isInteger(value) || value < 0)) {
            throw new Error('Population totals are unavailable. Please contact the Barangay San Pablo office.');
        }
        document.getElementById('resident-population-total').textContent = values[0].toLocaleString();
        document.getElementById('resident-population-purok-1').textContent = values[1].toLocaleString();
        document.getElementById('resident-population-purok-2').textContent = values[2].toLocaleString();
        document.getElementById('resident-population-purok-3').textContent = values[3].toLocaleString();
        status.hidden = true;
        grid.hidden = false;
    } catch (error) {
        showError(status, error);
        status.className = 'resident-population-status resident-population-error';
    }
}

async function loadFunds() {
    const yearSelect = document.getElementById('fund-year');
    if (!yearSelect) return;
    const categorySelect = document.getElementById('fund-category');
    const fundList = document.getElementById('fund-list');
    const annualList = document.getElementById('annual-budgets');
    try {
        const [{ data: budgets, error: budgetError }, { data: funds, error: fundError }] = await Promise.all([
            supabase.from('annual_budgets').select('*').order('year', { ascending: false }),
            supabase.from('funds').select('*').order('date_received', { ascending: false })
        ]);
        if (budgetError) throw budgetError;
        if (fundError) throw fundError;

        const years = [...new Set([...budgets, ...funds].map(item => Number(item.year)))];
        yearSelect.innerHTML = '<option value="">Select Year</option>' + years.map(year =>
            `<option value="${year}">${year}</option>`).join('');
        if (years.length) yearSelect.value = String(years[0]);

        const render = () => {
            const year = yearSelect.value ? Number(yearSelect.value) : null;
            const category = categorySelect?.value || 'Barangay';
            const shownBudgets = budgets.filter(item => (item.category || 'Barangay') === category
                && (year === null || Number(item.year) === year));
            const shownFunds = funds.filter(item => (item.category || 'Barangay') === category
                && (year === null || Number(item.year) === year));
            const annualTotal = shownBudgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            const expenseTotal = shownFunds.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
            const current = annualTotal - expenseTotal;
            const selectedCategoryLabel = category === 'SK' ? 'SK' : 'Barangay';
            document.querySelector('.budget-card h2').textContent = `${selectedCategoryLabel} Current Budget`;
            document.getElementById('budget-summary').previousElementSibling.textContent = `${selectedCategoryLabel} Current Budget`;
            document.getElementById('current-budget').textContent = `₱${current.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
            document.getElementById('budget-summary').textContent = `₱${current.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
            document.getElementById('annual-count').textContent = shownBudgets.length;
            document.getElementById('fund-count').textContent = shownFunds.length;
            annualList.innerHTML = shownBudgets.map(item => `
                <article class="fund-post"><div class="fund-post-header"><h3>Annual Budget ${escapeHtml(item.year)}</h3>
                <span class="fund">₱${Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <span class="fund-category-badge">${escapeHtml(item.category || 'Barangay')} Funds</span>
                <p>${escapeHtml(item.description)}</p>
                ${item.image ? `<img class="sidebar-budget-image" src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="Annual budget">` : ''}</article>
            `).join('') || '<div class="empty-state">No annual budgets posted yet.</div>';
            fundList.innerHTML = shownFunds.map(item => `
                <article class="fund-post"><div class="fund-post-header"><h3>${escapeHtml(item.fund_name)}</h3>
                <span class="${Number(item.amount) < 0 ? 'expense' : 'fund'}">₱${Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <span class="fund-category-badge">${escapeHtml(item.category || 'Barangay')} Funds</span>
                <div class="meta-line"><span class="quarter">${escapeHtml(item.quarter || '')}</span><small>${escapeHtml(item.date_received || '')}</small></div>
                <p>${escapeHtml(item.description)}</p>
                ${item.image ? `<img src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="">` : ''}</article>
            `).join('') || '<div class="empty-state">No expenses posted yet.</div>';
        };
        yearSelect.addEventListener('change', render);
        categorySelect?.addEventListener('change', render);
        render();
    } catch (error) {
        showError(fundList, error);
        showError(annualList, error);
    }
}

async function requireProfileRole(role) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
        window.location.replace('login.html');
        return null;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) {
        window.location.replace('login.html');
        return null;
    }
    const { data: profile, error } = await supabase.from('admin_profiles')
        .select('role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (profile?.role !== role) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        window.location.replace('login.html?error=unauthorized');
        return null;
    }
    return user;
}

async function requireAdmin() {
    return requireProfileRole('admin');
}

async function requireLgu() {
    return requireProfileRole('lgu');
}

function formValues(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    delete values.id;
    delete values.image;
    return values;
}

async function uploadImage(file, table) {
    if (!file || !file.size) return undefined;
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
    const path = `${table}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('site-images').upload(path, file, {
        cacheControl: '3600', upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    return data.publicUrl;
}

const management = {
    residents: {
        fields: ['firstname', 'middlename', 'lastname', 'birthdate', 'gender', 'marital', 'contactnum', 'purok'],
        columns: ['firstname', 'lastname', 'birthdate', 'contactnum', 'purok'],
        form: 'resident-form', rows: 'resident-rows'
    },
    officials: {
        fields: ['name', 'position', 'group_name', 'position_rank', 'description', 'image'],
        columns: ['name', 'position', 'group_name'],
        form: 'official-form', rows: 'official-rows'
    },
    annual_budgets: {
        fields: ['year', 'amount', 'description', 'image'],
        columns: ['year', 'amount', 'description'],
        form: 'annual-form', rows: 'annual-rows'
    },
    funds: {
        fields: ['fund_name', 'year', 'quarter', 'current_budget', 'amount', 'date_received', 'description', 'image'],
        columns: ['fund_name', 'year', 'amount'],
        form: 'fund-form', rows: 'fund-rows'
    },
    announcements: {
        fields: ['title', 'message', 'publish_date', 'image'],
        columns: ['title', 'publish_date'],
        form: 'announcement-form', rows: 'announcement-rows'
    }
};

const adminData = {};

function renderOfficialCards(officials) {
    const groups = new Map();
    officials.forEach(official => {
        const records = groups.get(official.group_name) || [];
        records.push(official);
        groups.set(official.group_name, records);
    });
    const fixedGroups = ['Barangay Council', 'Sangguniang Kabataan'];
    fixedGroups.forEach(group => {
        if (!groups.has(group)) groups.set(group, []);
    });
    const target = document.getElementById('official-groups');
    if (!target) return;
    const orderedGroups = [
        ...fixedGroups,
        ...[...groups.keys()].filter(group => !fixedGroups.includes(group)).sort((left, right) => left.localeCompare(right))
    ];
    const officialCard = (official, group, position, rank) => official ? `
        <article class="official-card official-card--occupied">
            <img src="${escapeHtml(imageUrl(official.image, 'officials'))}" alt="${escapeHtml(officialPositionLabel(official))}">
            <div class="official-card-copy">
                <span>${escapeHtml(officialPositionLabel(official))}</span>
                <h3>${escapeHtml(official.name)}</h3>
                ${official.description ? `<p>${escapeHtml(official.description)}</p>` : ''}
            </div>
            <div class="official-card-actions">
                <button type="button" data-edit="officials" data-record="${escapeHtml(JSON.stringify(official))}">Edit</button>
                <button type="button" class="official-remove-button" data-delete="officials" data-id="${official.id}">Remove</button>
            </div>
        </article>` : `
        <article class="official-card official-card--empty">
            <img class="official-empty-avatar" src="${escapeHtml(imageUrl('', 'officials'))}" alt="">
            <div class="official-card-copy">
                <span>${escapeHtml(position)}</span>
                <h3>Vacant</h3>
            </div>
            <button type="button" class="official-add-button"
                data-add-official="${escapeHtml(group)}"
                data-position="${escapeHtml(position)}"
                data-rank="${rank}">+ Add Official</button>
        </article>`;
    target.innerHTML = orderedGroups.map(group => {
        const records = groups.get(group);
        records.sort((left, right) => Number(left.position_rank || 99) - Number(right.position_rank || 99)
            || String(left.name).localeCompare(String(right.name)));
        const isYouthCouncil = /sangguniang kabataan|\bsk\b/i.test(group || '');
        const captain = records.find(record => Number(record.position_rank) === 1);
        const secretary = records.find(record => Number(record.position_rank) === 2);
        const treasurer = records.find(record => Number(record.position_rank) === 3);
        const assignedCouncilors = new Set();
        const councilorSlots = Array.from({ length: 7 }, (_, index) => {
            const rank = index + 4;
            const official = records.find(record => Number(record.position_rank) === rank);
            if (official) assignedCouncilors.add(official.id);
            const role = `${isYouthCouncil ? 'SK ' : ''}Kagawad ${index + 1}`;
            const position = role;
            return { official, rank, position };
        });
        const extraCouncilors = records.filter(record => {
            const rank = Number(record.position_rank);
            return rank > 10 || (rank >= 4 && rank <= 10 && !assignedCouncilors.has(record.id));
        });
        const chairLabel = isYouthCouncil ? 'SK Chairperson' : 'Barangay Captain';
        const councilorHeading = isYouthCouncil ? 'SK Kagawad Positions' : 'Kagawad Positions';
        const chartTiers = `
            <section class="official-chart-level">
                <h3 class="official-tier-label">${chairLabel}</h3>
                <div class="official-chart-grid official-chart-grid--top">
                    ${officialCard(captain, group, chairLabel, 1)}
                </div>
            </section>
            <div class="official-chart-connector" aria-hidden="true"></div>
            <section class="official-chart-level">
                <h3 class="official-tier-label">Secretary &amp; Treasurer</h3>
                <div class="official-chart-grid official-chart-grid--middle">
                    ${officialCard(secretary, group, 'Secretary', 2)}
                    ${officialCard(treasurer, group, 'Treasurer', 3)}
                </div>
            </section>
            <div class="official-chart-connector" aria-hidden="true"></div>
            <section class="official-chart-level">
                <div class="official-tier-header">
                    <h3 class="official-tier-label">${councilorHeading}</h3>
                </div>
                <div class="official-chart-grid">
                    ${councilorSlots.map(({ official, rank, position }) =>
                        officialCard(official, group, position, rank)).join('')}
                </div>
                ${extraCouncilors.length ? `<div class="official-chart-grid official-chart-grid--extras">
                    ${extraCouncilors.map(official => officialCard(official, group, officialPositionLabel(official), Number(official.position_rank))).join('')}
                </div>` : ''}
            </section>`;
        return `<section class="official-group">
            <div class="official-group-heading">
                <h2>${escapeHtml(group || 'Other')}</h2>
                <span>${records.length} profiles</span>
            </div>
            <div class="official-org-chart">${chartTiers}</div>
        </section>`;
    }).join('');
}

function renderFundAdmin() {
    const annualTarget = document.getElementById('annual-list-admin');
    const fundsTarget = document.getElementById('fund-list-admin');
    if (!annualTarget && !fundsTarget) return;
    const budgets = adminData.annual_budgets || [];
    const funds = adminData.funds || [];
    const yearSelect = document.getElementById('admin-fund-year');
    const categorySelect = document.getElementById('admin-fund-category');
    const availableYears = [...new Set([...budgets, ...funds].map(row => String(row.year)).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a));
    if (yearSelect) {
        const previousYear = yearSelect.value;
        yearSelect.innerHTML = '<option value="">Select Year</option>' + availableYears
            .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
        yearSelect.value = availableYears.includes(previousYear) ? previousYear : (availableYears[0] || '');
    }
    const year = yearSelect?.value;
    const category = categorySelect?.value || 'Barangay';
    const shownBudgets = budgets.filter(row => (row.category || 'Barangay') === category
        && (!year || String(row.year) === year));
    const shownFunds = funds.filter(row => (row.category || 'Barangay') === category
        && (!year || String(row.year) === year));
    const annualTotal = shownBudgets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseTotal = shownFunds.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
    const currentBudget = annualTotal - expenseTotal;
    const formattedBudget = `₱${currentBudget.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    const currentBudgetTarget = document.getElementById('admin-current-budget');
    const summaryTarget = document.getElementById('admin-budget-summary');
    const categoryLabel = category === 'SK' ? 'SK' : 'Barangay';
    const budgetHeading = document.querySelector('.funds-sidebar .budget-card h2');
    const summaryHeading = summaryTarget?.previousElementSibling;
    if (budgetHeading) budgetHeading.textContent = `${categoryLabel} Current Budget`;
    if (summaryHeading) summaryHeading.textContent = `${categoryLabel} Current Budget`;
    if (currentBudgetTarget) currentBudgetTarget.textContent = formattedBudget;
    if (summaryTarget) summaryTarget.textContent = formattedBudget;
    const annualCount = document.getElementById('admin-annual-count');
    const expenseCount = document.getElementById('admin-expense-count');
    if (annualCount) annualCount.textContent = shownBudgets.length;
    if (expenseCount) expenseCount.textContent = shownFunds.length;
    if (annualTarget) {
        annualTarget.innerHTML = shownBudgets.map(record => `
            <article class="fund-post">
                <div class="fund-post-header"><h3>Annual Budget ${escapeHtml(record.year)}</h3>
                    <span class="fund">₱${Number(record.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <span class="fund-category-badge">${escapeHtml(record.category || 'Barangay')} Funds</span>
                <p>${escapeHtml(record.description || '')}</p>
                ${record.image ? `<img src="${escapeHtml(imageUrl(record.image, 'funds'))}" alt="Annual budget image">` : ''}
                <div class="post-actions">
                    <button type="button" data-edit="annual_budgets" data-record="${escapeHtml(JSON.stringify(record))}">Edit</button>
                    <button type="button" class="delete-btn" data-delete="annual_budgets" data-id="${record.id}">Delete</button>
                </div>
            </article>`).join('') || '<div class="empty-state">No annual budgets have been added yet.</div>';
    }
    if (fundsTarget) {
        fundsTarget.innerHTML = shownFunds.map(record => `
            <article class="fund-post">
                <div class="fund-post-header"><h3>${escapeHtml(record.fund_name)}</h3>
                    <span class="expense">₱${Math.abs(Number(record.amount || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <span class="fund-category-badge">${escapeHtml(record.category || 'Barangay')} Funds</span>
                <div class="meta-line"><span class="quarter">${escapeHtml(record.quarter || '')}</span><small>${escapeHtml(record.date_received || '')}</small></div>
                <p>${escapeHtml(record.description || '')}</p>
                ${record.image ? `<img src="${escapeHtml(imageUrl(record.image, 'funds'))}" alt="Expense image">` : ''}
                <div class="post-actions">
                    <button type="button" data-edit="funds" data-record="${escapeHtml(JSON.stringify(record))}">Edit</button>
                    <button type="button" class="delete-btn" data-delete="funds" data-id="${record.id}">Delete</button>
                </div>
            </article>`).join('') || '<div class="empty-state">No expenses have been recorded yet.</div>';
    }
}

function renderAdminAnnouncements(announcements) {
    const target = document.getElementById('announcement-list-admin');
    if (!target) return;
    const search = document.getElementById('announcement-search')?.value.trim().toLowerCase() || '';
    const filtered = announcements.filter(item => !search
        || `${item.title} ${item.message}`.toLowerCase().includes(search));
    const count = document.getElementById('announcement-count');
    if (count) count.textContent = `${filtered.length} published notice${filtered.length === 1 ? '' : 's'}`;
    target.innerHTML = filtered.map(item => `
        <article class="published-announcement-card">
            <div class="published-announcement-media">
                ${item.image ? `<img src="${escapeHtml(imageUrl(item.image, 'announcements'))}" alt="Announcement photo" loading="lazy">` : '<div class="published-announcement-no-image">No image uploaded</div>'}
            </div>
            <div class="published-announcement-body">
                <div class="published-announcement-meta"><span>Published update</span><time>${escapeHtml(item.publish_date || '')}</time></div>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message)}</p>
                <div class="announcement-actions">
                    <button type="button" data-edit="announcements" data-record="${escapeHtml(JSON.stringify(item))}">Edit</button>
                    <button type="button" class="btn-delete" data-delete="announcements" data-id="${item.id}">Delete</button>
                </div>
            </div>
        </article>`).join('') || '<p>No announcements have been published.</p>';
}

async function refreshTable(table) {
    const definition = management[table];
    const { data, error } = await supabase.from(table).select('*').order('id', { ascending: false });
    if (error) throw error;
    adminData[table] = data;
    const rows = document.getElementById(definition.rows);
    if (table === 'residents' && rows) {
        rows.innerHTML = data.map((record, index) => `
            <tr data-search="${escapeHtml(Object.values(record).join(' '))}">
                <td>${index + 1}</td><td>${escapeHtml(record.firstname)}</td><td>${escapeHtml(record.middlename || '')}</td>
                <td>${escapeHtml(record.lastname)}</td><td>${escapeHtml(record.birthdate || '')}</td>
                <td>${escapeHtml(record.gender || '')}</td><td>${escapeHtml(record.marital || '-')}</td>
                <td>${escapeHtml(record.contactnum || '')}</td><td>${escapeHtml(record.purok || '')}</td>
                <td class="action-buttons">
                    <a class="btn-edit" href="admin-resident-form.html?edit=${encodeURIComponent(record.id)}">Edit</a>
                    <button type="button" class="btn-delete" data-delete="residents" data-id="${record.id}">Delete</button>
                </td>
            </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;">No residents found.</td></tr>';
    } else if (table === 'officials' && document.getElementById('official-groups')) {
        renderOfficialCards(data);
    } else if ((table === 'funds' || table === 'annual_budgets') && (document.getElementById('fund-list-admin') || document.getElementById('annual-list-admin'))) {
        renderFundAdmin();
    } else if (table === 'announcements' && document.getElementById('announcement-list-admin')) {
        renderAdminAnnouncements(data);
    }
    const countElement = {
        residents: 'resident-count', funds: 'fund-count', announcements: 'announcement-count'
    }[table];
    if (countElement && document.getElementById(countElement)) document.getElementById(countElement).textContent = data.length;
}

function populateForm(form, record) {
    for (const [name, value] of Object.entries(record)) {
        const input = form.elements.namedItem(name);
        if (input && input.type !== 'file') input.value = value ?? '';
    }
    const formId = form.getAttribute('id');
    if (formId === 'official-form') {
        document.getElementById('official-modal-title').textContent = 'Edit Official';
        document.getElementById('official-modal').hidden = false;
    } else if (formId === 'annual-form') {
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'false');
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Edit Annual Budget';
    } else if (formId === 'fund-form') {
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'false');
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Edit Expense';
    } else if (formId === 'resident-form') {
        document.getElementById('resident-form-title').textContent = 'Edit Resident';
        document.getElementById('resident-save-button').textContent = 'Save Changes';
    } else if (formId === 'announcement-form') {
        document.querySelector('.composer-panel h2').textContent = 'Edit Announcement';
        form.querySelector('button[type="submit"]').textContent = 'Save Changes';
    }
}

async function saveRecord(table, form) {
    const id = form.elements.namedItem('id').value;
    const imageFile = form.elements.namedItem('image')?.files?.[0];
    const values = formValues(form);
    if (table === 'announcements' && !values.publish_date) values.publish_date = null;
    if (table === 'funds' && !values.date_received) values.date_received = null;
    const imageUrl = await uploadImage(imageFile, table);
    if (imageUrl) values.image = imageUrl;
    if (table === 'funds') {
        const selectedYear = Number(values.year);
        const category = values.category || 'Barangay';
        values.amount = -Math.abs(Number(values.amount));
        if (!values.date_received) values.date_received = new Date().toISOString().slice(0, 10);
        const [{ data: budgets, error: budgetError }, { data: expenses, error: expensesError }] = await Promise.all([
            supabase.from('annual_budgets').select('amount').eq('year', selectedYear).eq('category', category),
            supabase.from('funds').select('id,amount').eq('year', selectedYear).eq('category', category)
        ]);
        if (budgetError) throw budgetError;
        if (expensesError) throw expensesError;
        const totalBudget = budgets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const totalExpenses = expenses.reduce((sum, row) => sum
            + (String(row.id) === String(id) ? 0 : Math.abs(Number(row.amount || 0))), 0);
        values.current_budget = totalBudget - totalExpenses - Math.abs(values.amount);
    }
    const statement = id
        ? supabase.from(table).update(values).eq('id', id).select('id').single()
        : supabase.from(table).insert(values).select('id').single();
    const { data, error } = await statement;
    if (error) throw error;
    form.reset();
    form.elements.namedItem('id').value = '';
    const formId = form.getAttribute('id');
    if (formId === 'official-form') {
        document.getElementById('official-modal').hidden = true;
        document.getElementById('official-modal-title').textContent = 'Add New Official';
    }
    if (formId === 'annual-form') {
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'true');
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Add Annual Budget';
    }
    if (formId === 'fund-form') {
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'true');
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Add Expense';
    }
    if (formId === 'announcement-form') {
        document.querySelector('.composer-panel h2').textContent = 'Add Announcement';
        form.querySelector('button[type="submit"]').textContent = 'Add Announcement';
    }
    if (formId === 'resident-form') {
        window.location.assign('admin-residents.html');
        return;
    }
    await refreshTable(table);
}

async function loadAdmin() {
    const message = document.getElementById('admin-message');
    try {
        const user = await requireAdmin();
        if (!user) return;
        if (page === 'admin-resident-form') {
            await loadResidentForEdit();
            return;
        }
        const tables = Object.keys(management).filter(table =>
            document.getElementById(management[table].rows)
            || (table === 'officials' && document.getElementById('official-groups'))
            || ((table === 'funds' || table === 'annual_budgets')
                && (document.getElementById('fund-list-admin') || document.getElementById('annual-list-admin')))
            || (table === 'announcements' && document.getElementById('announcement-list-admin'))
        );
        if (tables.length) {
            await Promise.all(tables.map(refreshTable));
        }
    } catch (error) {
        showError(message, error);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const message = document.getElementById('login-message');
    const form = event.currentTarget;
    const role = form.elements.namedItem('account_type').value;
    const { data, error } = await supabase.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
    });
    if (error) return showError(message, error);
    const { data: profile, error: profileError } = await supabase.from('admin_profiles')
        .select('role').eq('id', data.user.id).maybeSingle();
    if (profileError) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        return showError(message, profileError);
    }
    if (profile?.role !== role) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        return showError(message, { message: 'This account is not authorized for the selected account type.' });
    }
    window.location.assign(role === 'lgu' ? 'lgu-create-admin.html' : 'admin-home.html');
}

async function loadLguAdminPage() {
    const message = document.getElementById('lgu-message');
    try {
        const user = await requireLgu();
        if (user) {
            document.getElementById('lgu-email').textContent = user.email;
            document.getElementById('create-admin-form').hidden = false;
        }
    } catch (error) {
        showError(message, error);
    }
}

async function handleCreateAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById('lgu-message');
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending invitation…';
    message.hidden = true;
    try {
        const { error } = await supabase.functions.invoke('create-admin', {
            body: { email: form.elements.email.value.trim() }
        });
        if (error) throw error;
        form.reset();
        message.textContent = 'Admin invitation sent. The admin must use the email link to set a password.';
        message.hidden = false;
        message.classList.remove('login-error');
        message.classList.add('login-success');
    } catch (error) {
        message.classList.remove('login-success');
        message.classList.add('login-error');
        showError(message, error);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function loadPasswordSetup() {
    const message = document.getElementById('password-message');
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            showError(message, { message: 'This invitation link is invalid or expired. Ask the LGU to send a new invitation.' });
            return;
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) throw new Error('The invitation does not belong to an active user.');
        document.getElementById('set-password-form').hidden = false;
    } catch (error) {
        showError(message, error);
    }
}

async function handleSetPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById('password-message');
    const password = form.elements.password.value;
    if (password !== form.elements.confirm_password.value) {
        return showError(message, { message: 'The passwords do not match.' });
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        message.classList.remove('login-error');
        message.classList.add('login-success');
        message.textContent = 'Password saved. Opening the admin workspace…';
        message.hidden = false;
        window.location.assign('admin-home.html');
    } catch (error) {
        showError(message, error);
    } finally {
        button.disabled = false;
    }
}

async function handleAdminSubmit(event) {
    const form = event.target.closest('form');
    if (!form) return;
    const table = Object.keys(management).find(key => management[key].form === form.getAttribute('id'));
    if (!table) return;
    event.preventDefault();
    const message = document.getElementById('admin-message');
    try {
        await saveRecord(table, form);
    } catch (error) {
        showError(message, error);
    }
}

function openOfficialModal(groupName = 'Barangay Council', position = '', rank = '') {
    const form = document.getElementById('official-form');
    if (!form) return;
    form.reset();
    form.elements.namedItem('id').value = '';
    form.elements.namedItem('group_name').value = groupName;
    form.elements.namedItem('position').value = position;
    form.elements.namedItem('position_rank').value = rank || 99;
    document.getElementById('official-modal-title').textContent = 'Add New Official';
    document.getElementById('official-modal').hidden = false;
}

function setupOfficialPreview(officials) {
    const target = document.getElementById('official-groups');
    const form = document.getElementById('official-form');
    const modal = document.getElementById('official-modal');
    if (!target || !form || !modal) return;

    const updateMessage = message => {
        const status = document.getElementById('admin-message');
        if (status) status.textContent = message;
    };

    ['close-official-modal', 'cancel-official-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            modal.hidden = true;
        });
    });

    target.addEventListener('click', event => {
        const addButton = event.target.closest('[data-add-official]');
        if (addButton) {
            openOfficialModal(
                addButton.dataset.addOfficial || 'Barangay Council',
                addButton.dataset.position || '',
                addButton.dataset.rank || ''
            );
            return;
        }

        const editButton = event.target.closest('[data-edit="officials"]');
        if (editButton) {
            populateForm(form, JSON.parse(editButton.dataset.record));
            return;
        }

        const deleteButton = event.target.closest('[data-delete="officials"]');
        if (!deleteButton || !window.confirm('Remove this demo official from the preview?')) return;
        const index = officials.findIndex(official => String(official.id) === deleteButton.dataset.id);
        if (index !== -1) {
            officials.splice(index, 1);
            renderOfficialCards(officials);
            updateMessage('Demo profile removed from this preview only. Nothing was changed in Supabase.');
        }
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const id = form.elements.namedItem('id').value;
        const values = formValues(form);
        values.position_rank = Number(values.position_rank);
        if (id) {
            const existing = officials.find(official => String(official.id) === String(id));
            if (!existing) return;
            Object.assign(existing, values);
            updateMessage('Demo profile updated in this preview only. Nothing was changed in Supabase.');
        } else {
            officials.push({
                id: `preview-${crypto.randomUUID()}`,
                ...values,
                image: '',
                description: values.description || ''
            });
            updateMessage('Demo profile added to this preview only. Nothing was changed in Supabase.');
        }
        form.reset();
        form.elements.namedItem('id').value = '';
        modal.hidden = true;
        document.getElementById('official-modal-title').textContent = 'Add New Official';
        renderOfficialCards(officials);
    });
}

async function handleAdminAction(event) {
    const addButton = event.target.closest('[data-add-official]');
    if (addButton) {
        openOfficialModal(
            addButton.dataset.addOfficial || 'Barangay Council',
            addButton.dataset.position || '',
            addButton.dataset.rank || ''
        );
        return;
    }
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
        const record = JSON.parse(editButton.dataset.record);
        const form = document.getElementById(management[editButton.dataset.edit].form);
        if (form) populateForm(form, record);
        return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (!deleteButton || !window.confirm(deleteButton.dataset.delete === 'officials'
        ? 'Remove this official and clear the position slot?'
        : 'Are you sure you want to delete this record?')) return;
    const message = document.getElementById('admin-message');
    try {
        const { error } = await supabase.from(deleteButton.dataset.delete)
            .delete().eq('id', deleteButton.dataset.id);
        if (error) throw error;
        await refreshTable(deleteButton.dataset.delete);
    } catch (error) {
        showError(message, error);
    }
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return showError(
        document.getElementById('admin-message')
            || document.getElementById('lgu-message')
            || document.getElementById('login-message'),
        error
    );
    window.location.assign('index.html');
}

async function loadResidentForEdit() {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    const { data, error } = await supabase.from('residents').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('The resident record could not be found.');
    populateForm(document.getElementById('resident-form'), data);
}

function setupAdminPage() {
    document.getElementById('logout-button')?.addEventListener('click', signOut);
    document.addEventListener('submit', handleAdminSubmit);
    document.addEventListener('click', handleAdminAction);
    ['close-official-modal', 'cancel-official-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('official-modal').hidden = true;
        });
    });
    document.getElementById('official-modal')?.addEventListener('click', event => {
        if (event.target.id === 'official-modal') event.currentTarget.hidden = true;
    });
    document.getElementById('open-expense-btn')?.addEventListener('click', () => {
        const form = document.getElementById('fund-form');
        form.reset();
        form.elements.namedItem('id').value = '';
        form.elements.namedItem('year').value = document.getElementById('admin-fund-year').value
            || String(new Date().getFullYear());
        form.elements.namedItem('category').value = document.getElementById('admin-fund-category').value || 'Barangay';
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Add Expense';
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'false');
    });
    document.getElementById('open-annual-btn')?.addEventListener('click', () => {
        const form = document.getElementById('annual-form');
        form.reset();
        form.elements.namedItem('id').value = '';
        form.elements.namedItem('category').value = document.getElementById('admin-fund-category').value || 'Barangay';
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Add Annual Budget';
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'false');
    });
    document.querySelectorAll('[data-close-popup]').forEach(button => {
        button.addEventListener('click', () => {
            document.getElementById(button.dataset.closePopup).setAttribute('aria-hidden', 'true');
        });
    });
    document.querySelectorAll('.popup').forEach(popup => {
        popup.addEventListener('click', event => {
            if (event.target === popup) popup.setAttribute('aria-hidden', 'true');
        });
    });
    document.getElementById('generate-report-btn')?.addEventListener('click', () => window.print());
    document.getElementById('admin-fund-year')?.addEventListener('change', renderFundAdmin);
    document.getElementById('admin-fund-category')?.addEventListener('change', renderFundAdmin);
    document.getElementById('resident-search')?.addEventListener('submit', event => event.preventDefault());
    document.getElementById('resident-search')?.addEventListener('input', filterResidents);
    document.getElementById('resident-search')?.addEventListener('change', filterResidents);
    document.getElementById('announcement-search')?.addEventListener('input', () => {
        renderAdminAnnouncements(adminData.announcements || []);
    });
}

function filterResidents() {
    const searchForm = document.getElementById('resident-search');
    if (!searchForm) return;
    const search = searchForm.elements.search.value.trim().toLowerCase();
    const purok = searchForm.elements.purok.value;
    document.querySelectorAll('#resident-rows tr[data-search]').forEach(row => {
        const textMatches = row.dataset.search.toLowerCase().includes(search);
        const purokMatches = !purok || row.cells[8].textContent === purok;
        row.hidden = !textMatches || !purokMatches;
    });
}

function start() {
    document.querySelectorAll('[data-year]').forEach(element => {
        element.textContent = new Date().getFullYear();
    });
    const currentPage = document.body.dataset.page || '';
    const isHomeOfficialsSection = currentPage === 'home'
        && window.location.hash === '#officials';
    if (isHomeOfficialsSection) {
        pendingHomeOfficialsScroll = true;
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        window.scrollTo(0, 0);
    }
    const navTarget = {
        home: 'index.html',
        'residents-public': 'residents.html',
        'admin-resident-form': 'admin-residents.html'
    }[currentPage] || `${currentPage}.html`;
    document.querySelectorAll('.nav a[href]').forEach(link => {
        const isPublicOfficialsLink = !currentPage.startsWith('admin-')
            && link.hash === '#officials'
            && link.pathname.split('/').pop() === 'index.html';
        const isPublicHomeLink = !currentPage.startsWith('admin-')
            && !link.hash
            && link.pathname.split('/').pop() === 'index.html';
        const isCurrentPage = isPublicOfficialsLink
            ? currentPage === 'officials' || isHomeOfficialsSection
            : isPublicHomeLink && isHomeOfficialsSection
                ? false
                : link.pathname.split('/').pop() === navTarget;
        if (isCurrentPage) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
    if (!currentPage.startsWith('admin-')) {
        document.querySelectorAll('.nav a[href]').forEach(link => {
            if (link.hash !== '#officials' || link.pathname.split('/').pop() !== 'index.html') return;
            link.addEventListener('click', event => {
                if (currentPage !== 'home') return;
                event.preventDefault();
                window.history.pushState(null, '', '#officials');
                document.querySelectorAll('.nav a[aria-current="page"]').forEach(activeLink => {
                    activeLink.removeAttribute('aria-current');
                });
                link.setAttribute('aria-current', 'page');
                document.querySelector('.nav')?.classList.remove('active');
                scrollToHomeOfficials();
            });
        });
    }
    document.querySelector('.menu-toggle')?.addEventListener('click', () => {
        document.querySelector('.nav')?.classList.toggle('active');
    });
    if (page === 'admin-officials' && new URLSearchParams(window.location.search).has('preview')) {
        const previewOfficials = [
            { id: 'preview-captain', name: 'Juan Dela Cruz', position: 'Barangay Captain', group_name: 'Barangay Council', position_rank: 1, description: 'Barangay Council leadership' },
            { id: 'preview-secretary', name: 'Maria Santos', position: 'Secretary', group_name: 'Barangay Council', position_rank: 2 },
            { id: 'preview-treasurer', name: 'Pedro Ramos', position: 'Treasurer', group_name: 'Barangay Council', position_rank: 3 },
            { id: 'preview-kagawad-1', name: 'Ana Reyes', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 4, description: 'Temporary demo profile — Peace and Order' },
            { id: 'preview-kagawad-2', name: 'Jose Garcia', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 5, description: 'Temporary demo profile — Infrastructure and Public Works' },
            { id: 'preview-kagawad-3', name: 'Rosa Cruz', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 6, description: 'Temporary demo profile — Health and Sanitation' },
            { id: 'preview-kagawad-4', name: 'Mario Bautista', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 7, description: 'Temporary demo profile — Education and Youth' },
            { id: 'preview-kagawad-5', name: 'Elena Flores', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 8, description: 'Temporary demo profile — Agriculture and Environment' },
            { id: 'preview-kagawad-6', name: 'Ramon Torres', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 9, description: 'Temporary demo profile — Budget and Finance' },
            { id: 'preview-kagawad-7', name: 'Grace Mendoza', position: 'Kagawad', group_name: 'Barangay Council', position_rank: 10, description: "Temporary demo profile — Social Services and Women's Affairs" },
            { id: 'preview-sk-chair', name: 'Carlo Mendoza', position: 'SK Chairperson', group_name: 'Sangguniang Kabataan', position_rank: 1 },
            { id: 'preview-sk-secretary', name: 'Liza Bautista', position: 'Secretary', group_name: 'Sangguniang Kabataan', position_rank: 2 },
            { id: 'preview-sk-treasurer', name: 'Mark Flores', position: 'Treasurer', group_name: 'Sangguniang Kabataan', position_rank: 3 },
            { id: 'preview-sk-kagawad-1', name: 'Nina Cruz', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 4, description: 'Temporary demo profile — Youth Development' },
            { id: 'preview-sk-kagawad-2', name: 'Paolo Garcia', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 5, description: 'Temporary demo profile — Sports and Recreation' },
            { id: 'preview-sk-kagawad-3', name: 'Mika Santos', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 6, description: 'Temporary demo profile — Education' },
            { id: 'preview-sk-kagawad-4', name: 'Joshua Reyes', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 7, description: 'Temporary demo profile — Health and Wellness' },
            { id: 'preview-sk-kagawad-5', name: 'Angela Ramos', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 8, description: 'Temporary demo profile — Environment' },
            { id: 'preview-sk-kagawad-6', name: 'Daniel Cruz', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 9, description: 'Temporary demo profile — Arts and Culture' },
            { id: 'preview-sk-kagawad-7', name: 'Patricia Flores', position: 'SK Kagawad', group_name: 'Sangguniang Kabataan', position_rank: 10, description: 'Temporary demo profile — Community Projects' }
        ];
        const message = document.getElementById('admin-message');
        if (message) {
            message.textContent = 'Layout preview only — sample names are shown. No Supabase data can be changed here.';
            message.classList.add('official-preview-notice');
        }
        renderOfficialCards(previewOfficials);
        setupOfficialPreview(previewOfficials);
        return;
    }
    if (!configured) {
        const target = document.getElementById('login-message')
            || document.getElementById('password-message')
            || document.getElementById('lgu-message')
            || document.getElementById('admin-message')
            || document.getElementById('announcement-list')
            || document.getElementById('public-resident-population')
            || document.getElementById('officials-list')
            || document.getElementById('home-officials')
            || document.getElementById('fund-list');
        if (target) showError(target, { message: 'Website setup is incomplete: add your Supabase project URL and publishable/anon key in scripts/config.js.' });
        return;
    }
    if (page === 'login') {
        window.BSPIS_LOGIN_READY = true;
        document.getElementById('login-form').addEventListener('submit', handleLogin);
    }
    if (page === 'set-password') {
        window.BSPIS_PASSWORD_READY = true;
        document.getElementById('set-password-form').addEventListener('submit', handleSetPassword);
        loadPasswordSetup();
    }
    if (page === 'lgu-create-admin') {
        window.BSPIS_LGU_READY = true;
        document.getElementById('create-admin-form').addEventListener('submit', handleCreateAdmin);
        document.getElementById('logout-button')?.addEventListener('click', signOut);
        loadLguAdminPage();
    }
    if (page === 'admin' || page.startsWith('admin-')) {
        setupAdminPage();
        loadAdmin();
    }
    if (page === 'officials') loadOfficials();
    if (page === 'home') loadOfficials();
    if (page === 'admin-home') loadOfficials();
    if (page === 'announcements') loadAnnouncements();
    if (page === 'residents-public') loadResidentPopulation();
    if (page === 'funds') loadFunds();
}

start();
