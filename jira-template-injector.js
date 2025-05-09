(function () {
  'use strict';

  console.log('[Jira Template Injector] 🔁 Script loaded');

  const GITHUB_BASE_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/templates/';
  let currentTemplateKey = '';

  const waitForForm = async () => {
    for (let i = 0; i < 50; i++) {
      const form = document.querySelector(
        '#issue-create\\.ui\\.modal\\.create-form'
      );
      if (form) return form;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Form not found');
  };

  const getProjectKey = () => {
    const el = document.querySelector(
      '#issue-create\\.ui\\.modal\\.create-form\\.project-picker\\.project-select div[data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!el) {
      console.warn('[Jira Template Injector] ⚠️ Project selector not found');
      return null;
    }
    const match = el.textContent.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log('[Jira Template Injector] 🔑 Project text:', el.textContent);
    console.log('[Jira Template Injector] 🔑 Project key parsed:', key);
    return key;
  };

  const getIssueType = () => {
    const el = document.querySelector(
      '#issue-create\\.ui\\.modal\\.create-form\\.type-picker\\.issue-type-select div[data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!el) {
      console.warn('[Jira Template Injector] ⚠️ Issue type selector not found');
      return null;
    }
    const type = el.textContent.trim().toUpperCase().replace(/\s+/g, '-');
    console.log('[Jira Template Injector] 🏷️ Issue type text:', el.textContent);
    console.log('[Jira Template Injector] 🏷️ Issue type parsed:', type);
    return type;
  };

  const injectTextField = (field, value) => {
    const input = document.querySelector(
      `input[name="${field}"], textarea[name="${field}"]`
    );
    if (!input) {
      console.warn(`[Jira Template Injector] ❌ Field "${field}" not found`);
      return;
    }
    if (input.value.trim() !== '') {
      console.log(
        `[Jira Template Injector] 🔃 Field "${field}" already filled`
      );
      return;
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[Jira Template Injector] ✅ Injected "${field}": ${value}`);
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([field, config]) => {
      if (!config || typeof config !== 'object') return;
      if (config.type === 'text') {
        injectTextField(field, config.value);
      } else {
        console.log(
          `[Jira Template Injector] ℹ️ Skipping unsupported type for "${field}": ${config.type}`
        );
      }
    });
  };

  const loadAndInjectTemplate = async () => {
    console.log('[Jira Template Injector] 🚀 Starting injection process');
    const form = await waitForForm();
    if (!form) {
      console.warn('[Jira Template Injector] ❌ Form not found');
      return;
    }
    console.log('[Jira Template Injector] ✅ Form is present');

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
      console.log('[Jira Template Injector] ⏭ Template already injected');
      return;
    }

    currentTemplateKey = templateKey;
    const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
    console.log(
      `[Jira Template Injector] 🌐 Fetching template: ${templateUrl}`
    );

    try {
      const response = await fetch(templateUrl);
      if (!response.ok) throw new Error('Template fetch failed');
      const template = await response.json();
      console.log('[Jira Template Injector] 📥 Template loaded:', template);
      injectTemplateFields(template);
    } catch (err) {
      console.warn(
        '[Jira Template Injector] ⚠️ Failed to load template:',
        err.message
      );
    }
  };

  const observeModal = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        '#issue-create\\.ui\\.modal\\.create-form'
      );
      if (modal) {
        console.log(
          '[Jira Template Injector] 🕵️ Modal detected, reloading template'
        );
        loadAndInjectTemplate();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] 👀 DOM mutation observer set');
  };

  observeModal();
})();
