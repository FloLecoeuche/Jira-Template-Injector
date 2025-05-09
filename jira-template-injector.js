(function () {
  'use strict';

  console.log('[Jira Template Injector] Script started');

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
          reject(
            `[Jira Template Injector] Timeout waiting for selector: ${selector}`
          );
        }
      }, interval);
    });
  };

  const getProjectKey = () => {
    const el = document.querySelector('[data-testid="project-select"] span');
    if (!el) {
      console.warn('[Jira Template Injector] Project selector not found');
      return null;
    }
    const match = el.textContent.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log(
      '[Jira Template Injector] Raw project:',
      el.textContent,
      '→ Parsed key:',
      key
    );
    return key;
  };

  const getIssueType = () => {
    const el = document.querySelector('[data-testid="issuetype-select"] span');
    if (!el) {
      console.warn('[Jira Template Injector] Issue type selector not found');
      return null;
    }
    const type = el.textContent.trim().toUpperCase().replace(/\s+/g, '-');
    console.log(
      '[Jira Template Injector] Raw issue type:',
      el.textContent,
      '→ Parsed type:',
      type
    );
    return type;
  };

  const injectTextField = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (!input) {
      console.warn(
        `[Jira Template Injector] Text field "${fieldName}" not found`
      );
      return;
    }
    if (input.value.trim() !== '') {
      console.log(
        `[Jira Template Injector] Field "${fieldName}" already filled, skipping`
      );
      return;
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[Jira Template Injector] Injected text into "${fieldName}"`);
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([fieldName, fieldData]) => {
      if (!fieldData || typeof fieldData !== 'object') {
        console.warn(
          `[Jira Template Injector] Invalid field data for "${fieldName}"`
        );
        return;
      }

      const { type, value } = fieldData;
      if (type === 'text') {
        injectTextField(fieldName, value);
      } else {
        console.log(
          `[Jira Template Injector] Field "${fieldName}" has unsupported type "${type}", skipping`
        );
      }
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      console.log('[Jira Template Injector] Starting injection process');

      await waitForElement('form#issue-create\\.ui\\.modal\\.create-form');
      console.log('[Jira Template Injector] Form is present');

      const projectKey = getProjectKey();
      const issueType = getIssueType();
      if (!projectKey || !issueType) {
        console.warn(
          '[Jira Template Injector] Missing project key or issue type'
        );
        return;
      }

      const templateKey = `${projectKey}_${issueType}`;
      if (templateKey === currentTemplateKey) {
        console.log(
          '[Jira Template Injector] Template already applied, skipping'
        );
        return;
      }

      currentTemplateKey = templateKey;
      const url = `${GITHUB_BASE_URL}${templateKey}.json`;
      console.log('[Jira Template Injector] Fetching template from:', url);

      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[Jira Template Injector] Template not found:', url);
        return;
      }

      const template = await response.json();
      console.log('[Jira Template Injector] Template loaded:', template);

      injectTemplateFields(template);
    } catch (err) {
      console.error('[Jira Template Injector] Error during injection:', err);
    }
  };

  const observeDynamicChanges = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form#issue-create\\.ui\\.modal\\.create-form'
      );
      if (modal) {
        console.log(
          '[Jira Template Injector] Modal detected, reloading template'
        );
        loadAndInjectTemplate();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] DOM mutation observer set');
  };

  document.addEventListener('change', () => {
    const modal = document.querySelector(
      'form#issue-create\\.ui\\.modal\\.create-form'
    );
    if (modal) {
      console.log(
        '[Jira Template Injector] Change detected in modal, checking for updates'
      );
      loadAndInjectTemplate();
    }
  });

  observeDynamicChanges();
})();
