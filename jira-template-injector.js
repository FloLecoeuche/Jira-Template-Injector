// ==UserScript==
// @name         Jira Template Injector (With Key Extraction)
// @namespace    https://github.com/FloLecoeuche/Jira-Template-Injector
// @version      2.2
// @description  Auto-fill Jira fields based on project key (from parentheses) and issue type. Fully dynamic. No hardcoded fields. 🚀
// @author       Florian LECOEUCHE
// @match        https://blue-whale.atlassian.net/jira/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const GITHUB_BASE_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/templates/';

  let currentTemplateKey = ''; // For deduplication

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
    }
  };

  const injectSelectValue = (fieldName, value) => {
    const wrapper = document.querySelector(
      `[data-testid="${fieldName}-select"]`
    );
    if (
      !wrapper ||
      wrapper.textContent.toLowerCase().includes(value.toLowerCase())
    )
      return;

    wrapper.click();
    setTimeout(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const match = options.find(
        (opt) => opt.textContent.trim().toLowerCase() === value.toLowerCase()
      );
      if (match) match.click();
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
          });
        }
      }
    });
  };

  const loadAndInjectTemplate = async () => {
    try {
      const projectKey = getProjectKey();
      const issueType = getIssueType();

      if (!projectKey || !issueType) return;

      const templateKey = `${projectKey}_${issueType}`;

      // Prevent re-loading the same template multiple times
      if (templateKey === currentTemplateKey) return;

      currentTemplateKey = templateKey;
      const templateUrl = `${GITHUB_BASE_URL}${templateKey}.json`;

      console.log(`[Jira Template Injector] Trying to load: ${templateUrl}`);

      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.warn(
          `[Jira Template Injector] No template found for ${templateKey}`
        );
        return;
      }

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
      if (!modal) return;

      const projectSelector = document.querySelector(
        '[data-testid="project-select"]'
      );
      const typeSelector = document.querySelector(
        '[data-testid="issuetype-select"]'
      );

      if (projectSelector && typeSelector) {
        loadAndInjectTemplate();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  observeDynamicChanges();
})();
