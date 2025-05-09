// ==UserScript==
// @name         Jira Template Injector (Dynamic Script)
// @namespace    https://github.com/FloLecoeuche/Jira-Template-Injector
// @version      2.1
// @description  Automatically fill Jira issues based on project and issue type templates. Fully dynamic, no hardcoded fields! Supports spaces in names by converting to hyphens. 🚀
// @author       Florian LCOEUCHE
// @match        https://blue-whale.atlassian.net/jira/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const GITHUB_BASE_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/templates/';

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

  const formatForFilename = (text) => {
    return text.trim().toUpperCase().replace(/\s+/g, '-');
  };

  const getProjectKey = () => {
    const el = document.querySelector('[data-testid="project-select"] span');
    return el ? el.textContent.trim() : null;
  };

  const getIssueType = () => {
    const el = document.querySelector('[data-testid="issuetype-select"] span');
    return el ? el.textContent.trim() : null;
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
      await waitForElement('form[data-testid="issue-create.modal.form"]');

      const rawProjectKey = getProjectKey();
      const rawIssueType = getIssueType();

      if (!rawProjectKey || !rawIssueType) return;

      const projectKey = formatForFilename(rawProjectKey);
      const issueType = formatForFilename(rawIssueType);

      const templateUrl = `${GITHUB_BASE_URL}${projectKey}_${issueType}.json`;

      const response = await fetch(templateUrl);
      if (!response.ok) return;

      const template = await response.json();
      injectTemplateFields(template);
    } catch (err) {
      console.warn('[Jira Template Injector]', err);
    }
  };

  const observeModal = () => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        'form[data-testid="issue-create.modal.form"]'
      );
      if (modal) loadAndInjectTemplate();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  observeModal();
})();
