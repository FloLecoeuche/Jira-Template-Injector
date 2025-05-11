// ==UserScript==
// @name         Jira Template Injector Loader
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Loads the main Jira Template Injector script from GitHub for easy updates.
// @author       Florian LECOEUCHE
// @match        https://*.atlassian.net/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIGURATION ---
  // Replace with your GitHub username and repository name
  const GITHUB_USERNAME = 'FloLecoeuche'; // Replace with your username
  const GITHUB_REPONAME = 'jira-template-injector'; // Replace with your repository name
  const GITHUB_BRANCH = 'feature/codev-gemini'; // Or the branch you want to use
  // --- END CONFIGURATION ---

  const mainScriptUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPONAME}/${GITHUB_BRANCH}/src/main.js`;

  console.log('🔃 Jira Template Injector: Loader script started.');

  const requestMethod =
    typeof GM_xmlhttpRequest !== 'undefined'
      ? GM_xmlhttpRequest
      : typeof GM !== 'undefined' && typeof GM.xmlHttpRequest !== 'undefined'
      ? GM.xmlHttpRequest
      : null;

  if (!requestMethod) {
    console.error(
      '❌ Jira Template Injector: GM_xmlhttpRequest or GM.xmlHttpRequest is not available. Cannot load main script.'
    );
    alert(
      'Tampermonkey/Greasemonkey permission "GM_xmlhttpRequest" or "GM.xmlHttpRequest" might be missing or the extension is not functioning correctly.'
    );
    return;
  }

  requestMethod({
    method: 'GET',
    url: mainScriptUrl,
    onload: function (response) {
      if (response.status >= 200 && response.status < 300) {
        console.log(
          '✅ Jira Template Injector: Main script fetched successfully. Evaluating...'
        );
        try {
          // Pass GITHUB_USERNAME, GITHUB_REPONAME, GITHUB_BRANCH to the main script
          const scriptToEvaluate = `
                        (function(GITHUB_USERNAME, GITHUB_REPONAME, GITHUB_BRANCH) {
                            ${response.responseText}
                        })('${GITHUB_USERNAME}', '${GITHUB_REPONAME}', '${GITHUB_BRANCH}');
                    `;
          eval(scriptToEvaluate);
          // A safer alternative to eval if you don't need to pass variables directly:
          // const script = document.createElement('script');
          // script.textContent = response.responseText;
          // (document.head || document.documentElement).appendChild(script);
          // script.remove();
          console.log('🚀 Jira Template Injector: Main script evaluated.');
        } catch (e) {
          console.error(
            '❌ Jira Template Injector: Error evaluating main script:',
            e
          );
        }
      } else {
        console.error(
          `❌ Jira Template Injector: Failed to fetch main script. Status: ${response.status}`,
          response
        );
        alert(
          `Jira Template Injector: Failed to load main script from ${mainScriptUrl}. Status: ${response.status}. Check console for details.`
        );
      }
    },
    onerror: function (error) {
      console.error(
        '❌ Jira Template Injector: Error fetching main script:',
        error
      );
      alert(
        `Jira Template Injector: Network error loading main script from ${mainScriptUrl}. Check console for details.`
      );
    },
  });
})();
