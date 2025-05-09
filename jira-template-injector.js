(function () {
  'use strict';

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
    if (!el) return null;
    const match = el.textContent.match(/\(([^)]+)\)/);
    return match ? match[1].trim().toUpperCase() : null;
  };

  const getIssueType = () => {
    const el = document.querySelector('[data-testid="issuetype-select"] span');
    return el ? el.textContent.trim().toUpperCase().replace(/\s+/g, '-') : null;
  };

  const injectTextValue = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (input && input.value.trim() === '') {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`[Jira Template Injector] Injected value into ${fieldName}`);
    }
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([field, config]) => {
      if (!config || config.type !== 'text' || !config.value) return;
      injectTextValue(field, config.value);
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      await waitForElement('form[data-testid="issue-create.modal.form"]');

      const projectKey = getProjectKey();
      const issueType = getIssueType();

      if (!projectKey || !issueType) return;

      const templateKey = `${projectKey}_${issueType}`;
      if (templateKey === currentTemplateKey) return;

      currentTemplateKey = templateKey;
      const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;

      console.log(`[Jira Template Injector] Fetching: ${templateUrl}`);
      const response = await fetch(templateUrl);
      if (!response.ok) return;

      const template = await response.json();
      injectTemplateFields(template);
    } catch (err) {
      console.error('[Jira Template Injector] Error:', err);
    }
  };

  const observeDynamicChanges = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form[data-testid="issue-create.modal.form"]'
      );
      if (modal) loadAndInjectTemplate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  observeDynamicChanges();
})();
