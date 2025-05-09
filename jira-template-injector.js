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
          reject(`Timeout waiting for selector: ${selector}`);
        }
      }, interval);
    });
  };

  const getProjectKey = () => {
    const wrapper = document.getElementById(
      'issue-create.ui.modal.create-form.project-picker.project-select'
    );
    if (!wrapper) {
      console.warn(
        '[Jira Template Injector] ❌ Project select wrapper not found'
      );
      return null;
    }

    const el = wrapper.querySelector('span'); // ou 'div' si le texte est dans un <div>
    if (!el) {
      console.warn('[Jira Template Injector] ❌ Project span not found');
      return null;
    }

    const rawText = el.textContent || '';
    const match = rawText.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;

    console.log(
      '[Jira Template Injector] ✅ Found project element text:',
      rawText
    );
    console.log('[Jira Template Injector] 🔑 Parsed project key:', key);
    return key;
  };

  const getIssueType = () => {
    const wrapper = document.getElementById(
      'issue-create.ui.modal.create-form.type-picker.issue-type-select'
    );
    if (!wrapper) {
      console.warn(
        '[Jira Template Injector] ❌ Issue type select wrapper not found'
      );
      return null;
    }

    const el = wrapper.querySelector('span');
    if (!el) {
      console.warn('[Jira Template Injector] ❌ Issue type span not found');
      return null;
    }

    const rawText = el.textContent || '';
    const type = rawText.trim().toUpperCase().replace(/\s+/g, '-');

    console.log(
      '[Jira Template Injector] ✅ Found issue type element text:',
      rawText
    );
    console.log('[Jira Template Injector] 🏷️ Parsed issue type:', type);
    return type;
  };

  const injectTextValue = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (!input) {
      console.warn(
        `[Jira Template Injector] ❌ Input field not found: ${fieldName}`
      );
      return;
    }
    if (input.value.trim() === '') {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(
        `[Jira Template Injector] ✍️ Injected value into ${fieldName}:`,
        value
      );
    } else {
      console.log(
        `[Jira Template Injector] ⏩ Field ${fieldName} already filled, skipping`
      );
    }
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([field, config]) => {
      if (!config || typeof config !== 'object' || config.type !== 'text') {
        console.warn(
          `[Jira Template Injector] ⛔ Unsupported field type or invalid config for "${field}"`,
          config
        );
        return;
      }

      injectTextValue(field, config.value);
    });
  };

  const loadAndInjectTemplate = async () => {
    console.log('[Jira Template Injector] 🚀 Starting injection process');

    const form = document.querySelector(
      '#issue-create\\.ui\\.modal\\.create-form'
    );
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
      console.log(
        '[Jira Template Injector] 💤 Template already injected, skipping'
      );
      return;
    }

    currentTemplateKey = templateKey;
    const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
    console.log('[Jira Template Injector] 🌐 Fetching template:', templateUrl);

    try {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.warn(
          '[Jira Template Injector] ❌ Template not found at:',
          templateUrl
        );
        return;
      }

      const template = await response.json();
      console.log('[Jira Template Injector] 📦 Template loaded:', template);
      injectTemplateFields(template);
    } catch (error) {
      console.error(
        '[Jira Template Injector] ❗ Error fetching template:',
        error
      );
    }
  };

  const observeDynamicChanges = () => {
    const observer = new MutationObserver((mutations) => {
      const modal = document.querySelector(
        '#issue-create\\.ui\\.modal\\.create-form'
      );
      if (!modal) return;

      console.log(
        '[Jira Template Injector] 🕵️ Modal detected, reloading template'
      );
      loadAndInjectTemplate();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] 👀 DOM mutation observer set');
  };

  observeDynamicChanges();
})();
