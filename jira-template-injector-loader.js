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
  const SCRIPT_URL =
    'https://raw.githubusercontent.com/FloLecoeuche/Jira-Template-Injector/main/jira-template-injector.js';

  function loadScript() {
    console.log('[Jira Loader] Fetching remote script from:', SCRIPT_URL);

    fetch(SCRIPT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch script: ' + response.statusText);
        }
        return response.text();
      })
      .then((script) => {
        console.log('[Jira Loader] Remote script fetched, evaluating...');
        try {
          eval(script);
          console.log('[Jira Loader] Script executed successfully.');
        } catch (evalError) {
          console.error('[Jira Loader] Script evaluation error:', evalError);
        }
      })
      .catch((error) => {
        console.error('[Jira Loader] Error loading remote script:', error);
      });
  }

  // Wait for page load before attempting fetch
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadScript);
  } else {
    loadScript();
  }
})();
