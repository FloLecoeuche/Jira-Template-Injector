(function () {
  'use strict';

  console.log('[JTI] Script started');

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
          reject(`[JTI] Timeout waiting for selector: ${selector}`);
        }
      }, interval);
    });
  };

  const getProjectKey = () => {
    const el = document.querySelector('[data-testid="project-select"] span');
    if (!el) {
      console.warn('[JTI] Project selector not found');
      return null;
    }
    const match = el.textContent.match(/\(([^)]+)\)/);
    const key = match ? match[1].trim().toUpperCase() : null;
    console.log(
      `[JTI] Project full label: "${el.textContent}" → key: "${key}"`
    );
    return key;
  };

  const getIssueType = () => {
    const el = document.querySelector('[data-testid="issuetype-select"] span');
    if (!el) {
      console.warn('[JTI] Issue type selector not found');
      return null;
    }
    const type = el.textContent.trim().toUpperCase().replace(/\s+/g, '-');
    console.log(
      `[JTI] Issue type label: "${el.textContent}" → type: "${type}"`
    );
    return type;
  };

  const injectTextValue = (fieldName, value) => {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (!input) {
      console.warn(`[JTI] Input "${fieldName}" not found`);
      return;
    }
    if (input.value.trim() !== '') {
      console.log(`[JTI] Field "${fieldName}" already filled`);
      return;
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[JTI] Injected "${value}" into "${fieldName}"`);
  };

  const injectTemplateFields = (template) => {
    console.log('[JTI] Injecting fields...');
    Object.entries(template).forEach(([fieldName, fieldObj]) => {
      if (typeof fieldObj !== 'object' || !fieldObj.type || !fieldObj.value) {
        console.warn(
          `[JTI] Field "${fieldName}" is invalid or missing type/value`
        );
        return;
      }
      if (fieldObj.type === 'text') {
        injectTextValue(fieldName, fieldObj.value);
      } else {
        console.log(
          `[JTI] Skipping field "${fieldName}" with type "${fieldObj.type}"`
        );
      }
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      console.log('[JTI] Inject triggered...');
      await waitForElement('form[data-testid="issue-create.modal.form"]');

      const projectKey = getProjectKey();
      const issueType = getIssueType();

      if (!projectKey || !issueType) {
        console.warn('[JTI] Missing project or issue type');
        return;
      }

      const templateKey = `${projectKey}_${issueType}`;
      if (templateKey === currentTemplateKey) {
        console.log(
          `[JTI] Template "${templateKey}" already injected, skipping`
        );
        return;
      }

      currentTemplateKey = templateKey;
      const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;
      console.log(`[JTI] Fetching template: ${templateUrl}`);

      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.warn(`[JTI] Template not found at URL: ${templateUrl}`);
        return;
      }

      const template = await response.json();
      console.log('[JTI] Template loaded:', template);
      injectTemplateFields(template);
    } catch (err) {
      console.error('[JTI] Error loading template:', err);
    }
  };

  const observeDynamicChanges = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form[data-testid="issue-create.modal.form"]'
      );
      if (!modal) return;

      console.log('[JTI] Modal detected — checking selectors...');
      const projectSelector = document.querySelector(
        '[data-testid="project-select"]'
      );
      const typeSelector = document.querySelector(
        '[data-testid="issuetype-select"]'
      );

      if (projectSelector && typeSelector) {
        loadAndInjectTemplate();
      } else {
        console.warn('[JTI] Missing project or issue type selectors');
      }
    });

    console.log('[JTI] Watching DOM for modal open...');
    observer.observe(document.body, { childList: true, subtree: true });
  };

  observeDynamicChanges();
})();
