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
    container.innerHTML = [...groups].map(([group, records]) => `
        <section class="public-official-group">
            <div class="public-official-group-heading"><h2>${escapeHtml(group)}</h2><span>${records.length} profiles</span></div>
            <div class="public-tier">${records.map(official => `
                <article class="public-official-card">
                    <img src="${escapeHtml(imageUrl(official.image, 'officials'))}" alt="${escapeHtml(official.position)}">
                    <div><small>${escapeHtml(official.position)}</small><h3>${escapeHtml(official.name)}</h3>
                    ${official.description ? `<p>${escapeHtml(official.description)}</p>` : ''}</div>
                </article>`).join('')}
            </div>
        </section>`).join('') || '<p>No officials have been added yet.</p>';
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
        container.innerHTML = '<p>No announcements have been published.</p>';
        return;
    }
    container.innerHTML = `<div class="announcement-list">${data.map(item => `
        <article class="announcement-card">
            ${item.image ? `<div class="announcement-media"><img src="${escapeHtml(imageUrl(item.image, 'announcements'))}" alt=""></div>` : ''}
            <div class="announcement-card-content">
                <span class="announcement-type">Community notice</span>
                <time class="announcement-date">${escapeHtml(item.publish_date || '')}</time>
                <h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.message)}</p>
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
        yearSelect.innerHTML = '<option value="">All years</option>' + years.map(year =>
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
                <span>₱${Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <p>${escapeHtml(item.description)}</p>
                ${item.image ? `<img class="sidebar-budget-image" src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="Annual budget">` : ''}</article>
            `).join('') || '<p>No annual budgets posted yet.</p>';
            fundList.innerHTML = shownFunds.map(item => `
                <article class="fund-post"><div class="fund-post-header"><h3>${escapeHtml(item.fund_name)}</h3>
                <span>₱${Math.abs(Number(item.amount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                <p>${escapeHtml(item.description)}</p><p>${escapeHtml(item.date_received || '')} ${escapeHtml(item.quarter || '')}</p>
                ${item.image ? `<img src="${escapeHtml(imageUrl(item.image, 'funds'))}" alt="">` : ''}</article>
            `).join('') || '<p>No fund records for this year.</p>';
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

async function refreshTable(table) {
    const definition = management[table];
    const { data, error } = await supabase.from(table).select('*').order('id', { ascending: false });
    if (error) throw error;
    const rows = document.getElementById(definition.rows);
    rows.innerHTML = data.map(record => `
        <tr>${definition.columns.map(column => `<td>${escapeHtml(record[column])}</td>`).join('')}
        <td><button type="button" data-edit="${table}" data-record="${escapeHtml(JSON.stringify(record))}">Edit</button>
        <button type="button" data-delete="${table}" data-id="${record.id}">Delete</button></td></tr>
    `).join('') || `<tr><td colspan="${definition.columns.length + 1}">No records.</td></tr>`;
    const countElement = {
        residents: 'resident-count', funds: 'fund-count', announcements: 'announcement-count'
    }[table];
    if (countElement) document.getElementById(countElement).textContent = data.length;
}

function populateForm(form, record) {
    for (const [name, value] of Object.entries(record)) {
        const input = form.elements.namedItem(name);
        if (input && input.type !== 'file') input.value = value ?? '';
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveRecord(table, form) {
    const definition = management[table];
    const id = form.elements.namedItem('id').value;
    const imageFile = form.elements.namedItem('image')?.files?.[0];
    const values = formValues(form);
    if (table === 'announcements' && !values.publish_date) values.publish_date = null;
    if (table === 'funds' && !values.date_received) values.date_received = null;
    const imageUrl = await uploadImage(imageFile, table);
    if (imageUrl) values.image = imageUrl;
    const statement = id
        ? supabase.from(table).update(values).eq('id', id).select('id').single()
        : supabase.from(table).insert(values).select('id').single();
    const { data, error } = await statement;
    if (error) throw error;
    form.reset();
    form.elements.namedItem('id').value = '';
    await refreshTable(table);
}

async function loadAdmin() {
    const message = document.getElementById('admin-message');
    try {
        const user = await requireAdmin();
        if (!user) return;
        await Promise.all(Object.keys(management).map(refreshTable));
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
    window.location.assign('admin.html');
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
        populateForm(document.getElementById(management[editButton.dataset.edit].form), record);
        return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (!deleteButton || !window.confirm('Delete this record?')) return;
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
    if (page === 'login') document.getElementById('login-form').addEventListener('submit', handleLogin);
    if (page === 'admin') {
        document.getElementById('logout-button').addEventListener('click', signOut);
        document.addEventListener('submit', handleAdminSubmit);
        document.addEventListener('click', handleAdminAction);
        loadAdmin();
    }
    if (page === 'officials') loadOfficials();
    if (page === 'home') loadOfficials();
    if (page === 'announcements') loadAnnouncements();
    if (page === 'funds') loadFunds();
}

start();
