// ==UserScript==
// @name         Jira Template Injector (Debug Logging)
// @namespace    https://github.com/FloLecoeuche/Jira-Template-Injector
// @version      2.3
// @description  Auto-fill Jira fields with full debug logs based on project key (from parentheses) and issue type. Fully dynamic. 🚀
// @author
// @match        https://blue-whale.atlassian.net/jira/*
// @grant        none
// ==/UserScript==

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

  const injectTextValue = (fieldName, value) => {
    const input = document.querySelector(`[name="\${fieldName}"]`);
    if (input && input.value.trim() === '') {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`[Jira Template Injector] Injected value into \${fieldName}`);
    }
  };

  const injectSelectValue = (fieldName, value) => {
    const wrapper = document.querySelector(
      `[data-testid="\${fieldName}-select"]`
    );
    if (!wrapper) {
      console.warn(
        `[Jira Template Injector] Dropdown \${fieldName}-select not found`
      );
      return;
    }

    if (wrapper.textContent.toLowerCase().includes(value.toLowerCase())) {
      console.log(
        `[Jira Template Injector] Dropdown \${fieldName} already set to \${value}`
      );
      return;
    }

    wrapper.click();
    setTimeout(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const match = options.find(
        (opt) => opt.textContent.trim().toLowerCase() === value.toLowerCase()
      );
      if (match) {
        match.click();
        console.log(
          `[Jira Template Injector] Selected \${value} in \${fieldName}`
        );
      } else {
        console.warn(
          `[Jira Template Injector] Value \${value} not found in dropdown \${fieldName}`
        );
      }
    }, 200);
  };

  const injectTemplateFields = (template) => {
    Object.entries(template).forEach(([field, value]) => {
      if (!value) return;

      if (typeof value === 'string') {
        injectTextValue(field, value);
        injectSelectValue(field, value);
      }

      if (Array.isArray(value) && field === 'labels') {
        const input = document.querySelector('input[aria-label="Add label"]');
        if (input) {
          value.forEach((label) => {
            input.value = label;
            input.dispatchEvent(
              new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
            );
            console.log(`[Jira Template Injector] Added label: \${label}`);
          });
        }
      }
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      console.log('[Jira Template Injector] Attempting template injection…');
      await waitForElement('form[data-testid="issue-create.modal.form"]');

      const projectKey = getProjectKey();
      const issueType = getIssueType();

      if (!projectKey || !issueType) {
        console.warn('[Jira Template Injector] Missing project or issue type');
        return;
      }

      const templateKey = `\${projectKey}_\${issueType}`;
      if (templateKey === currentTemplateKey) {
        console.log(
          '[Jira Template Injector] Template already injected, skipping'
        );
        return;
      }

      currentTemplateKey = templateKey;
      const templateUrl = `\${GITHUB_BASE_URL}\${templateKey}.json`;
      console.log(
        '[Jira Template Injector] Fetching template from:',
        templateUrl
      );

      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.warn(
          '[Jira Template Injector] Template not found:',
          templateUrl
        );
        return;
      }

      const template = await response.json();
      console.log('[Jira Template Injector] Template loaded:', template);
      injectTemplateFields(template);
    } catch (err) {
      console.error('[Jira Template Injector] Unexpected error:', err);
    }
  };

  const observeDynamicChanges = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form[data-testid="issue-create.modal.form"]'
      );
      if (!modal) return;

      console.log('[Jira Template Injector] Detected create issue modal open');
      const projectSelector = document.querySelector(
        '[data-testid="project-select"]'
      );
      const typeSelector = document.querySelector(
        '[data-testid="issuetype-select"]'
      );

      if (projectSelector && typeSelector) {
        console.log(
          '[Jira Template Injector] Both project and issue type selectors found'
        );
        loadAndInjectTemplate();
      } else {
        console.warn('[Jira Template Injector] Missing selectors in modal');
      }
    });

    console.log('[Jira Template Injector] Observing DOM for changes...');
    observer.observe(document.body, { childList: true, subtree: true });
  };

  observeDynamicChanges();
})();
