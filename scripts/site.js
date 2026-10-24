import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const page = document.body.dataset.page;
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

function renderOfficials(officials, container) {
    const groups = officials.reduce((map, official) => {
        const records = map.get(official.group_name) || [];
        records.push(official);
        map.set(official.group_name, records);
        return map;
    }, new Map());
    const homePage = container.id === 'home-officials';
    const groupMarkup = ([group, records]) => {
        const tiers = [[], [], []];
        records.forEach(official => {
            const rank = Number(official.position_rank) || 99;
            tiers[rank <= 1 ? 0 : rank <= 3 ? 1 : 2].push(official);
        });
        const tierMarkup = (items, label, modifier, showDescription) => items.length ? `
            <p class="${homePage ? 'public-directory-tier-label' : 'public-tier-label'}">${label}</p>
            <div class="${homePage ? 'public-directory-tier' : 'public-tier'} ${modifier ? `${homePage ? 'public-directory-tier' : 'public-tier'}--${modifier}` : ''}">
                ${items.map(official => `
                    <article class="${homePage ? 'public-directory-card' : 'public-official-card'}">
                        <img src="${escapeHtml(imageUrl(official.image, 'officials'))}" alt="${escapeHtml(official.position)}">
                        <div><small>${escapeHtml(official.position)}</small><h3>${escapeHtml(official.name)}</h3>
                            ${showDescription && official.description ? `<p>${escapeHtml(official.description)}</p>` : ''}
                        </div>
                    </article>`).join('')}
            </div>` : '';
        return `<section class="${homePage ? 'public-directory-group' : 'public-official-group'}">
            <div class="${homePage ? 'public-directory-group-heading' : 'public-official-group-heading'}">
                <h2>${escapeHtml(group)}</h2><span>${records.length} profiles</span>
            </div>
            ${tierMarkup(tiers[0], 'Chairperson', 'top', true)}
            ${tierMarkup(tiers[1], 'Secretary & Treasurer', 'middle', false)}
            ${tierMarkup(tiers[2], 'Kagawad / Councilors', 'bottom', false)}
        </section>`;
    };
    container.innerHTML = [...groups].map(groupMarkup).join('') || '<p>No officials have been added yet.</p>';
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
    } catch (error) {
        containers.forEach(container => showError(container, error));
    }
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
    </div>` : ''}<div class="announcement-list">${data.map(item => `
        <article class="announcement-card">
            ${item.image ? `<div class="announcement-media"><img src="${escapeHtml(imageUrl(item.image, 'announcements'))}" alt=""></div>` : ''}
            <div class="announcement-card-content">
                <div class="announcement-card-meta">
                    <span class="announcement-type">Community notice</span>
                    <time class="announcement-date" datetime="${escapeHtml(item.publish_date || '')}">${escapeHtml(formatDate(item.publish_date))}</time>
                </div>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(preview(item.message))}</p>
            </div>
        </article>`).join('')}</div>`;
}

async function loadFunds() {
    const yearSelect = document.getElementById('fund-year');
    if (!yearSelect) return;
    const fundList = document.getElementById('fund-list');
    const annualList = document.getElementById('annual-budgets');
    try {
        const [{ data: budgets, error: budgetError }, { data: funds, error: fundError }] = await Promise.all([
            supabase.from('annual_budgets').select('*').order('year', { ascending: false }),
            supabase.from('funds').select('*').order('date_received', { ascending: false })
        ]);
        if (budgetError) throw budgetError;
        if (fundError) throw fundError;

        const years = [...new Set(budgets.map(item => Number(item.year)))];
        yearSelect.innerHTML = '<option value="">Select Year</option>' + years.map(year =>
            `<option value="${year}">${year}</option>`).join('');
        if (years.length) yearSelect.value = String(years[0]);

        const render = () => {
            const year = yearSelect.value ? Number(yearSelect.value) : null;
            const shownBudgets = year === null ? budgets : budgets.filter(item => Number(item.year) === year);
            const shownFunds = year === null ? funds : funds.filter(item => Number(item.year) === year);
            const annualTotal = shownBudgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            const expenseTotal = shownFunds.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
            const current = annualTotal - expenseTotal;
            document.getElementById('current-budget').textContent = `₱${current.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
            document.getElementById('budget-summary').textContent = `₱${current.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
            document.getElementById('annual-count').textContent = shownBudgets.length;
            document.getElementById('fund-count').textContent = shownFunds.length;
            annualList.innerHTML = shownBudgets.map(item => `
                <article class="fund-post"><div class="fund-post-header"><h3>Annual Budget ${escapeHtml(item.year)}</h3>
                <span class="fund">₱${Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <p>${escapeHtml(item.description)}</p>
                ${item.image ? `<img class="sidebar-budget-image" src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="Annual budget">` : ''}</article>
            `).join('') || '<div class="empty-state">No annual budgets posted yet.</div>';
            fundList.innerHTML = shownFunds.map(item => `
                <article class="fund-post"><div class="fund-post-header"><h3>${escapeHtml(item.fund_name)}</h3>
                <span class="${Number(item.amount) < 0 ? 'expense' : 'fund'}">₱${Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <div class="meta-line"><span class="quarter">${escapeHtml(item.quarter || '')}</span><small>${escapeHtml(item.date_received || '')}</small></div>
                <p>${escapeHtml(item.description)}</p>
                ${item.image ? `<img src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="">` : ''}</article>
            `).join('') || '<div class="empty-state">No expenses posted yet.</div>';
        };
        yearSelect.addEventListener('change', render);
        render();
    } catch (error) {
        showError(fundList, error);
        showError(annualList, error);
    }
}

async function requireAdmin() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) {
        window.location.replace('login.html');
        return null;
    }
    const { data: profile, error } = await supabase.from('admin_profiles')
        .select('role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile) {
        await supabase.auth.signOut();
        window.location.replace('login.html?error=unauthorized');
        return null;
    }
    return user;
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
    const target = document.getElementById('official-groups');
    if (!target) return;
    const tierHtml = (records, label, modifier) => {
        if (!records.length) return '';
        return `<p class="official-tier-label">${label}</p>
            <div class="official-chart-grid${modifier ? ` official-chart-grid--${modifier}` : ''}">
                ${records.map(official => `<article class="official-card">
                    <img src="${escapeHtml(imageUrl(official.image, 'officials'))}" alt="${escapeHtml(official.position)}">
                    <div class="official-card-copy">
                        <span>${escapeHtml(official.position)}</span>
                        <h3>${escapeHtml(official.name)}</h3>
                        ${official.description && label === 'Chairperson' ? `<p>${escapeHtml(official.description)}</p>` : ''}
                    </div>
                    <div class="official-card-actions">
                        <button type="button" data-edit="officials" data-record="${escapeHtml(JSON.stringify(official))}">Edit</button>
                        <button type="button" data-delete="officials" data-id="${official.id}">Delete</button>
                    </div>
                </article>`).join('')}
            </div>`;
    };
    target.innerHTML = [...groups].map(([group, records]) => {
        records.sort((left, right) => Number(left.position_rank || 99) - Number(right.position_rank || 99)
            || String(left.name).localeCompare(String(right.name)));
        const tiers = [[], [], [], []];
        records.forEach(record => {
            const rank = Number(record.position_rank) || 99;
            tiers[rank <= 1 ? 0 : rank <= 3 ? 1 : 2].push(record);
        });
        return `<section class="official-group">
            <div class="official-group-heading">
                <h2>${escapeHtml(group || 'Other')}</h2><span>${records.length} profiles</span>
            </div>
            ${tierHtml(tiers[0], 'Chairperson', 'top')}
            ${tierHtml(tiers[1], 'Secretary & Treasurer', 'middle')}
            ${tierHtml(tiers[2], 'Kagawad / Councilors', '')}
        </section>`;
    }).join('') || '<p>No officials have been added yet.</p>';
    const count = document.getElementById('official-count');
    if (count) count.textContent = officials.length;
}

function renderFundAdmin() {
    const annualTarget = document.getElementById('annual-list-admin');
    const fundsTarget = document.getElementById('fund-list-admin');
    if (!annualTarget && !fundsTarget) return;
    const budgets = adminData.annual_budgets || [];
    const funds = adminData.funds || [];
    const yearSelect = document.getElementById('admin-fund-year');
    const availableYears = [...new Set([...budgets, ...funds].map(row => String(row.year)).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a));
    if (yearSelect) {
        const previousYear = yearSelect.value;
        yearSelect.innerHTML = '<option value="">Select Year</option>' + availableYears
            .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
        yearSelect.value = availableYears.includes(previousYear) ? previousYear : (availableYears[0] || '');
    }
    const year = yearSelect?.value;
    const shownBudgets = year ? budgets.filter(row => String(row.year) === year) : budgets;
    const shownFunds = year ? funds.filter(row => String(row.year) === year) : funds;
    const annualTotal = shownBudgets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseTotal = shownFunds.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
    const currentBudget = annualTotal - expenseTotal;
    const formattedBudget = `₱${currentBudget.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    const currentBudgetTarget = document.getElementById('admin-current-budget');
    const summaryTarget = document.getElementById('admin-budget-summary');
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
    if (form.id === 'official-form') {
        document.getElementById('official-modal-title').textContent = 'Edit Official';
        document.getElementById('official-modal').hidden = false;
    } else if (form.id === 'annual-form') {
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'false');
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Edit Annual Budget';
    } else if (form.id === 'fund-form') {
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'false');
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Edit Expense';
    } else if (form.id === 'resident-form') {
        document.getElementById('resident-form-title').textContent = 'Edit Resident';
        document.getElementById('resident-save-button').textContent = 'Save Changes';
    } else if (form.id === 'announcement-form') {
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
        values.amount = -Math.abs(Number(values.amount));
        if (!values.date_received) values.date_received = new Date().toISOString().slice(0, 10);
        const [{ data: budgets, error: budgetError }, { data: expenses, error: expensesError }] = await Promise.all([
            supabase.from('annual_budgets').select('amount').eq('year', selectedYear),
            supabase.from('funds').select('id,amount').eq('year', selectedYear)
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
    if (form.id === 'official-form') {
        document.getElementById('official-modal').hidden = true;
        document.getElementById('official-modal-title').textContent = 'Add New Official';
    }
    if (form.id === 'annual-form') {
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'true');
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Add Annual Budget';
    }
    if (form.id === 'fund-form') {
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'true');
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Add Expense';
    }
    if (form.id === 'announcement-form') {
        document.querySelector('.composer-panel h2').textContent = 'Add Announcement';
        form.querySelector('button[type="submit"]').textContent = 'Add Announcement';
    }
    if (form.id === 'resident-form') {
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
    const { error } = await supabase.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
    });
    if (error) return showError(message, error);
    window.location.assign('admin-officials.html');
}

async function handleAdminSubmit(event) {
    const form = event.target.closest('form');
    if (!form) return;
    const table = Object.keys(management).find(key => management[key].form === form.id);
    if (!table) return;
    event.preventDefault();
    const message = document.getElementById('admin-message');
    try {
        await saveRecord(table, form);
    } catch (error) {
        showError(message, error);
    }
}

async function handleAdminAction(event) {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
        const record = JSON.parse(editButton.dataset.record);
        const form = document.getElementById(management[editButton.dataset.edit].form);
        if (form) populateForm(form, record);
        return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (!deleteButton || !window.confirm('Are you sure you want to delete this record?')) return;
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
    if (error) return showError(document.getElementById('admin-message'), error);
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
    document.getElementById('open-official-modal')?.addEventListener('click', () => {
        document.getElementById('official-form').reset();
        document.getElementById('official-form').elements.namedItem('id').value = '';
        document.getElementById('official-modal-title').textContent = 'Add New Official';
        document.getElementById('official-modal').hidden = false;
    });
    ['close-official-modal', 'cancel-official-modal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('official-modal').hidden = true;
        });
    });
    document.getElementById('official-modal')?.addEventListener('click', event => {
        if (event.target.id === 'official-modal') event.currentTarget.hidden = true;
    });
    document.getElementById('open-annual-btn')?.addEventListener('click', () => {
        const form = document.getElementById('annual-form');
        form.reset();
        form.elements.namedItem('id').value = '';
        document.getElementById('annual-popup').querySelector('h3').textContent = 'Add Annual Budget';
        document.getElementById('annual-popup').setAttribute('aria-hidden', 'false');
    });
    document.getElementById('open-expense-btn')?.addEventListener('click', () => {
        const form = document.getElementById('fund-form');
        form.reset();
        form.elements.namedItem('id').value = '';
        form.elements.namedItem('year').value = document.getElementById('admin-fund-year').value
            || String(new Date().getFullYear());
        document.getElementById('expense-popup').querySelector('h3').textContent = 'Add Expense';
        document.getElementById('expense-popup').setAttribute('aria-hidden', 'false');
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
    document.querySelector('.menu-toggle')?.addEventListener('click', () => {
        document.querySelector('.nav')?.classList.toggle('active');
    });
    if (!configured) {
        const target = document.getElementById('login-message')
            || document.getElementById('admin-message')
            || document.getElementById('announcement-list')
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
    if (page === 'admin' || page.startsWith('admin-')) {
        setupAdminPage();
        loadAdmin();
    }
    if (page === 'officials') loadOfficials();
    if (page === 'home') loadOfficials();
    if (page === 'announcements') loadAnnouncements();
    if (page === 'funds') loadFunds();
}

start();
