(function () {
  'use strict';

  console.log('[Jira Template Injector] 🔃 Script started');

  const GITHUB_BASE_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/templates/';
  let currentTemplateKey = '';

  const waitForForm = () => {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const form = document.querySelector(
          '#issue-create.ui.modal.create-form'
        );
        if (form) {
          clearInterval(check);
          console.log('[Jira Template Injector] ✅ Modal form is ready');
          resolve(form);
        }
      }, 200);
    });
  };

  const getProjectKey = () => {
    const el = document.querySelector(
      '#issue-create\\.ui\\.modal\\.create-form\\.project-picker\\.project-select [data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!el) {
      console.warn('[Jira Template Injector] ⛔ Project key element not found');
      return null;
    }
    const raw = el.textContent.trim();
    console.log('[Jira Template Injector] ✅ Found project element text:', raw);
    const match = raw.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log('[Jira Template Injector] 🔑 Parsed project key:', key);
    return key;
  };

  const getIssueType = () => {
    const el = document.querySelector(
      '#issue-create\\.ui\\.modal\\.create-form\\.type-picker\\.issue-type-select [data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!el) {
      console.warn('[Jira Template Injector] ⛔ Issue type element not found');
      return null;
    }
    const raw = el.textContent.trim();
    console.log(
      '[Jira Template Injector] ✅ Found issue type element text:',
      raw
    );
    const type = raw.toUpperCase().replace(/\s+/g, '-');
    console.log('[Jira Template Injector] 🏷️ Parsed issue type:', type);
    return type;
  };

  const injectTextValue = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (input && input.value.trim() === '') {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(
        `[Jira Template Injector] ✍️ Injected value into ${fieldName}`
      );
    }
  };

  const injectTemplateFields = (template) => {
    console.log('[Jira Template Injector] 🧪 Injecting fields...');
    Object.entries(template).forEach(([field, data]) => {
      if (!data || data.type !== 'text') {
        console.warn(
          `[Jira Template Injector] ⚠️ Skipping unsupported or invalid field: ${field}`
        );
        return;
      }
      injectTextValue(field, data.value);
    });
  };

  const loadAndInjectTemplate = async () => {
    console.log('[Jira Template Injector] 🚀 Starting injection process');
    await waitForForm();

    const projectKey = getProjectKey();
    const issueType = getIssueType();
    if (!projectKey || !issueType) {
      console.warn(
        '[Jira Template Injector] ❌ Missing project key or issue type'
      );
      return;
    }

    const templateKey = `${projectKey}_${issueType}`;
    if (templateKey === currentTemplateKey) {
      console.log(
        '[Jira Template Injector] 🔁 Template already applied, skipping...'
      );
      return;
    }

    currentTemplateKey = templateKey;
    const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
    console.log(
      '[Jira Template Injector] 📥 Fetching template from:',
      templateUrl
    );

    try {
      const response = await fetch(templateUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const template = await response.json();
      console.log('[Jira Template Injector] 📦 Template loaded:', template);
      injectTemplateFields(template);
    } catch (err) {
      console.error(
        '[Jira Template Injector] ❌ Failed to fetch template:',
        err
      );
    }
  };

  const observeSelectors = () => {
    console.log('[Jira Template Injector] 🧿 Watching for modal opening...');

    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        '#issue-create.ui.modal.create-form'
      );
      if (!modal) return;

      const projectSelect = document.getElementById(
        'issue-create.ui.modal.create-form.project-picker.project-select'
      );
      const typeSelect = document.getElementById(
        'issue-create.ui.modal.create-form.type-picker.issue-type-select'
      );

      if (!projectSelect || !typeSelect) {
        console.warn('[Jira Template Injector] ❌ Select elements not found');
        return;
      }

      const callback = () => {
        console.log(
          '[Jira Template Injector] 🕵️ Modal detected, reloading template'
        );
        loadAndInjectTemplate();
      };

      projectSelect.addEventListener('click', callback);
      typeSelect.addEventListener('click', callback);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] 👀 Mutation observer active');
  };

  observeSelectors();
})();
