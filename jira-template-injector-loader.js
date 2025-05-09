// ==UserScript==
// @name         Jira Template Injector Loader
// @namespace    https://github.com/FloLecoeuche/Jira-Template-Injector
// @version      1.0
// @description  Loader script to dynamically fetch and execute the latest Jira Template Injector from GitHub. Always up-to-date! 🚀
// @author       Florian LECOEUCHE
// @match        https://blue-whale.atlassian.net/jira/*
// @grant        none
// ==/UserScript==

(async function () {
  'use strict';
  const REMOTE_SCRIPT_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/jira-template-injector.js';

  try {
    const response = await fetch(REMOTE_SCRIPT_URL);
    const code = await response.text();
    eval(code);
  } catch (error) {
    console.error(
      '[Jira Template Injector Loader] Failed to load remote script:',
      error
    );
  }
})();
