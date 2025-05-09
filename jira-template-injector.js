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
    const el = document.querySelector('[data-testid="project-select"] span');
    if (!el) {
      console.warn('[Jira Template Injector] Project key element not found');
      return null;
    }
    const match = el.textContent.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log(`[Jira Template Injector] Project key found: ${key}`);
    return key;
  };

  const getIssueType = () => {
    const el = document.querySelector('[data-testid="issuetype-select"] span');
    if (!el) {
      console.warn('[Jira Template Injector] Issue type element not found');
      return null;
    }
    const type = el.textContent.trim().toUpperCase().replace(/\s+/g, '-');
    console.log(`[Jira Template Injector] Issue type found: ${type}`);
    return type;
  };

  const injectTextField = (field, value) => {
    console.log(
      `[Jira Template Injector] Attempting to inject into field: ${field}`
    );
    const input = document.querySelector(`[name="${field}"]`);
    if (!input) {
      console.warn(`[Jira Template Injector] Field not found: ${field}`);
      return;
    }
    if (input.value.trim() !== '') {
      console.log(`[Jira Template Injector] Field already filled: ${field}`);
      return;
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[Jira Template Injector] Injected value into field: ${field}`);
  };

  const injectTemplate = (template) => {
    Object.entries(template).forEach(([field, fieldConfig]) => {
      if (!fieldConfig || typeof fieldConfig !== 'object') return;
      if (fieldConfig.type !== 'text') {
        console.log(
          `[Jira Template Injector] Skipping non-text field: ${field}`
        );
        return;
      }
      injectTextField(field, fieldConfig.value);
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      await waitForElement('form[data-testid="issue-create.modal.form"]');

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
          `[Jira Template Injector] Template ${templateKey} already injected, skipping`
        );
        return;
      }

      currentTemplateKey = templateKey;
      const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
      console.log(`[Jira Template Injector] Fetching template: ${templateUrl}`);

      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.warn(
          `[Jira Template Injector] Template not found: ${templateUrl}`
        );
        return;
      }

      const template = await response.json();
      console.log('[Jira Template Injector] Template loaded:', template);

      injectTemplate(template);
    } catch (err) {
      console.error(
        '[Jira Template Injector] Error loading or injecting template:',
        err
      );
    }
  };

  const setupObservers = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form[data-testid="issue-create.modal.form"]'
      );
      if (!modal) return;

      const projectKey = getProjectKey();
      const issueType = getIssueType();

      if (projectKey && issueType) {
        loadAndInjectTemplate();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Jira Template Injector] DOM mutation observer set');
  };

  setupObservers();
})();
