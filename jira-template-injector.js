(function () {
  'use strict';

  console.log('[Jira Template Injector] 🔃 Script started');

  const GITHUB_BASE_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/templates/';
  let currentTemplateKey = '';

  const waitForElement = (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let elapsed = 0;
      const checkExist = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(checkExist);
          resolve(el);
        }
        elapsed += interval;
        if (elapsed >= timeout) {
          clearInterval(checkExist);
          reject(`⏰ Timeout waiting for selector: ${selector}`);
        }
      }, interval);
    });
  };

  const getProjectKey = () => {
    const projectContainer = document.querySelector(
      '#issue-create.ui.modal.create-form.project-picker.project-select'
    );
    if (!projectContainer) {
      console.log('[Jira Template Injector] ❌ Project container not found');
      return null;
    }

    const label = projectContainer.querySelector(
      '[data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!label) {
      console.log('[Jira Template Injector] ❌ Project label not found');
      return null;
    }

    const text = label.textContent || '';
    console.log(
      '[Jira Template Injector] ✅ Found project element text:',
      text
    );
    const match = text.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log('[Jira Template Injector] 🔑 Parsed project key:', key);
    return key;
  };

  const getIssueType = () => {
    const typeContainer = document.querySelector(
      '#issue-create.ui.modal.create-form.type-picker.issue-type-select'
    );
    if (!typeContainer) {
      console.log('[Jira Template Injector] ❌ Issue type container not found');
      return null;
    }

    const label = typeContainer.querySelector(
      '[data-testid="issue-field-select-base.ui.format-option-label.c-label"]'
    );
    if (!label) {
      console.log('[Jira Template Injector] ❌ Issue type label not found');
      return null;
    }

    const type = label.textContent.trim().toUpperCase().replace(/\s+/g, '-');
    console.log('[Jira Template Injector] 🏷️ Parsed issue type:', type);
    return type;
  };

  const injectTextField = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (input) {
      if (input.value.trim() === '') {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(
          `[Jira Template Injector] ✍️ Injected text value into "${fieldName}"`
        );
      } else {
        console.log(
          `[Jira Template Injector] ⛔ Field "${fieldName}" already filled, skipping`
        );
      }
    } else {
      console.log(`[Jira Template Injector] ❌ Field "${fieldName}" not found`);
    }
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([field, config]) => {
      if (!config || config.type !== 'text' || !config.value) {
        console.log(
          `[Jira Template Injector] ⚠️ Skipping field "${field}" (unsupported type or missing value)`
        );
        return;
      }

      injectTextField(field, config.value);
    });
  };

  const loadAndInjectTemplate = async () => {
    console.log('[Jira Template Injector] 🚀 Starting injection process');

    const form = document.querySelector('#issue-create.ui.modal.create-form');
    if (!form) {
      console.log('[Jira Template Injector] ❌ Modal form not found');
      return;
    }
    console.log('[Jira Template Injector] ✅ Form is present');

    const projectKey = getProjectKey();
    const issueType = getIssueType();
    if (!projectKey || !issueType) {
      console.log(
        '[Jira Template Injector] ❌ Missing project key or issue type'
      );
      return;
    }

    const templateKey = `${projectKey}_${issueType}`;
    if (templateKey === currentTemplateKey) {
      console.log(
        '[Jira Template Injector] 🔁 Same template already loaded, skipping'
      );
      return;
    }

    currentTemplateKey = templateKey;
    const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
    console.log('[Jira Template Injector] 🌐 Fetching template:', templateUrl);

    try {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.log(
          `[Jira Template Injector] ❌ Failed to fetch template: ${response.status}`
        );
        return;
      }

      const template = await response.json();
      console.log('[Jira Template Injector] 📦 Template loaded:', template);
      injectTemplateFields(template);
    } catch (err) {
      console.error('[Jira Template Injector] ❌ Error loading template:', err);
    }
  };

  const observeSelectors = () => {
    const projectEl = document.querySelector(
      '#issue-create.ui.modal.create-form.project-picker.project-select'
    );
    const typeEl = document.querySelector(
      '#issue-create.ui.modal.create-form.type-picker.issue-type-select'
    );

    if (!projectEl || !typeEl) {
      console.log(
        '[Jira Template Injector] ❌ Could not find selector containers'
      );
      return;
    }

    const observerCallback = (mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' || mutation.type === 'subtree') {
          console.log(
            '[Jira Template Injector] 🕵️ DOM mutation on selector, reloading template'
          );
          loadAndInjectTemplate();
          break;
        }
      }
    };

    const observerConfig = { childList: true, subtree: true };

    new MutationObserver(observerCallback).observe(projectEl, observerConfig);
    new MutationObserver(observerCallback).observe(typeEl, observerConfig);
    console.log(
      '[Jira Template Injector] 👀 Mutation observers set on project and type selectors'
    );
  };

  const observeModal = () => {
    const modalObserver = new MutationObserver(() => {
      const modal = document.querySelector(
        '#issue-create.ui.modal.create-form'
      );
      if (modal) {
        console.log(
          '[Jira Template Injector] 🕵️ Modal detected, reloading template'
        );
        loadAndInjectTemplate();
        observeSelectors(); // Init mutation observers on selectors after modal is visible
      }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] 🧿 Watching for modal opening...');
  };

  observeModal();
})();
