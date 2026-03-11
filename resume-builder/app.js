// ── State ──────────────────────────────────────────────────────────────────
const state = {
  experience: [],
  education: [],
  projects: [],
};

let expCounter = 0;
let eduCounter = 0;
let projCounter = 0;

// ── Helpers ────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function showSection(sectionId, condition) {
  const el = $(sectionId);
  if (!el) return;
  el.classList.toggle('hidden', !condition);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Live update ────────────────────────────────────────────────────────────
function update() {
  // Personal info
  const name     = $('name').value.trim();
  const jobTitle = $('title').value.trim();
  const email    = $('email').value.trim();
  const phone    = $('phone').value.trim();
  const location = $('location').value.trim();
  const website  = $('website').value.trim();
  const summary  = $('summary').value.trim();

  setText('p-name', name || 'Your Name');
  setText('p-title', jobTitle);

  // Contact row
  const contactEl = $('p-contact');
  const contacts = [email, phone, location, website].filter(Boolean);
  contactEl.innerHTML = contacts.map(c => `<span>${escapeHtml(c)}</span>`).join('');

  // Summary
  setText('p-summary', summary);
  showSection('p-summary-section', !!summary);

  // Experience
  renderExperiencePreview();

  // Education
  renderEducationPreview();

  // Skills
  const skillsRaw = $('skills').value;
  const skills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const skillsEl = $('p-skills');
  skillsEl.innerHTML = skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');
  showSection('p-skills-section', skills.length > 0);

  // Projects
  renderProjectsPreview();
}

// ── Experience ─────────────────────────────────────────────────────────────
function addExperience() {
  const id = expCounter++;
  state.experience.push({ id });
  renderExperienceEditor();
  update();
}

function removeExperience(id) {
  state.experience = state.experience.filter(e => e.id !== id);
  renderExperienceEditor();
  update();
}

function renderExperienceEditor() {
  const container = $('experience-list');
  container.innerHTML = '';
  state.experience.forEach(({ id }) => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <button class="remove-btn" onclick="removeExperience(${id})" title="Remove">×</button>
      <label>Company<input type="text" id="exp-company-${id}" placeholder="Acme Corp" oninput="update()" /></label>
      <label>Role / Title<input type="text" id="exp-role-${id}" placeholder="Software Engineer" oninput="update()" /></label>
      <label>Date Range<input type="text" id="exp-date-${id}" placeholder="Jan 2022 – Present" oninput="update()" /></label>
      <label>Description<textarea id="exp-desc-${id}" rows="3" placeholder="Key responsibilities and achievements..." oninput="update()"></textarea></label>
    `;
    container.appendChild(card);
  });
}

function renderExperiencePreview() {
  const container = $('p-experience');
  container.innerHTML = '';
  let hasContent = false;

  state.experience.forEach(({ id }) => {
    const company = $(`exp-company-${id}`)?.value.trim();
    const role    = $(`exp-role-${id}`)?.value.trim();
    const date    = $(`exp-date-${id}`)?.value.trim();
    const desc    = $(`exp-desc-${id}`)?.value.trim();

    if (!company && !role) return;
    hasContent = true;

    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `
      <div class="entry-head">
        <strong>${escapeHtml(role || '')}</strong>
        <span class="date">${escapeHtml(date || '')}</span>
      </div>
      <div class="entry-sub">${escapeHtml(company || '')}</div>
      ${desc ? `<div class="entry-desc">${escapeHtml(desc)}</div>` : ''}
    `;
    container.appendChild(entry);
  });

  showSection('p-experience-section', hasContent);
}

// ── Education ──────────────────────────────────────────────────────────────
function addEducation() {
  const id = eduCounter++;
  state.education.push({ id });
  renderEducationEditor();
  update();
}

function removeEducation(id) {
  state.education = state.education.filter(e => e.id !== id);
  renderEducationEditor();
  update();
}

function renderEducationEditor() {
  const container = $('education-list');
  container.innerHTML = '';
  state.education.forEach(({ id }) => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <button class="remove-btn" onclick="removeEducation(${id})" title="Remove">×</button>
      <label>Institution<input type="text" id="edu-school-${id}" placeholder="MIT" oninput="update()" /></label>
      <label>Degree / Field<input type="text" id="edu-degree-${id}" placeholder="B.S. Computer Science" oninput="update()" /></label>
      <label>Date Range<input type="text" id="edu-date-${id}" placeholder="2018 – 2022" oninput="update()" /></label>
    `;
    container.appendChild(card);
  });
}

function renderEducationPreview() {
  const container = $('p-education');
  container.innerHTML = '';
  let hasContent = false;

  state.education.forEach(({ id }) => {
    const school = $(`edu-school-${id}`)?.value.trim();
    const degree = $(`edu-degree-${id}`)?.value.trim();
    const date   = $(`edu-date-${id}`)?.value.trim();

    if (!school && !degree) return;
    hasContent = true;

    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `
      <div class="entry-head">
        <strong>${escapeHtml(degree || '')}</strong>
        <span class="date">${escapeHtml(date || '')}</span>
      </div>
      <div class="entry-sub">${escapeHtml(school || '')}</div>
    `;
    container.appendChild(entry);
  });

  showSection('p-education-section', hasContent);
}

// ── Projects ───────────────────────────────────────────────────────────────
function addProject() {
  const id = projCounter++;
  state.projects.push({ id });
  renderProjectsEditor();
  update();
}

function removeProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  renderProjectsEditor();
  update();
}

function renderProjectsEditor() {
  const container = $('project-list');
  container.innerHTML = '';
  state.projects.forEach(({ id }) => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <button class="remove-btn" onclick="removeProject(${id})" title="Remove">×</button>
      <label>Project Name<input type="text" id="proj-name-${id}" placeholder="My Awesome App" oninput="update()" /></label>
      <label>Tech / Stack<input type="text" id="proj-tech-${id}" placeholder="React, Node.js, PostgreSQL" oninput="update()" /></label>
      <label>Description<textarea id="proj-desc-${id}" rows="2" placeholder="What it does and what you built..." oninput="update()"></textarea></label>
    `;
    container.appendChild(card);
  });
}

function renderProjectsPreview() {
  const container = $('p-projects');
  container.innerHTML = '';
  let hasContent = false;

  state.projects.forEach(({ id }) => {
    const name = $(`proj-name-${id}`)?.value.trim();
    const tech = $(`proj-tech-${id}`)?.value.trim();
    const desc = $(`proj-desc-${id}`)?.value.trim();

    if (!name) return;
    hasContent = true;

    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `
      <div class="entry-head">
        <strong>${escapeHtml(name)}</strong>
      </div>
      ${tech ? `<div class="entry-sub">${escapeHtml(tech)}</div>` : ''}
      ${desc ? `<div class="entry-desc">${escapeHtml(desc)}</div>` : ''}
    `;
    container.appendChild(entry);
  });

  showSection('p-projects-section', hasContent);
}

// ── Wire up personal-info fields ───────────────────────────────────────────
['name','title','email','phone','location','website','summary','skills'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', update);
});

// ── Initial render ─────────────────────────────────────────────────────────
update();
