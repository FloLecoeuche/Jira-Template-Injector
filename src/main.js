// This script is intended to be loaded by the Tampermonkey loader.
// It does not contain Tampermonkey headers.

// The variables GITHUB_USERNAME, GITHUB_REPONAME, GITHUB_BRANCH are injected by the loader.
// They are globally accessible within the scope of the loader's IIFE.

(function () {
  'use strict';

  const LOG_PREFIX = 'JTI'; // Jira Template Injector

  // --- INTERNAL CONFIGURATION (May need adjustment if Jira IDs change) ---
  const CREATE_MODAL_ID = 'issue-create.ui.modal.create-form';
  const PROJECT_SELECTOR_ID =
    'issue-create.ui.modal.create-form.project-picker.project-select';
  const ISSUE_TYPE_SELECTOR_ID =
    'issue-create.ui.modal.create-form.type-picker.issue-type-select';

  // Selectors for identifying the actual editable area of a rich text editor
  const RICH_TEXT_EDITABLE_AREA_SELECTORS = [
    '.ProseMirror[role="textbox"][contenteditable="true"]', // Common for ProseMirror
    '#ak-editor-textarea[contenteditable="true"]', // Specific Jira ID for ProseMirror
    'div[aria-label*="Main content area"][contenteditable="true"]', // Another common pattern
    'div.ak-editor-content-area div[contenteditable="true"]', // More general Atlassian editor structure
  ];
  const RICH_TEXT_PLACEHOLDER_SELECTOR =
    'span[data-testid="placeholder-test-id"].placeholder-decoration';
  // --- END INTERNAL CONFIGURATION ---

  let projectKey = null;
  let issueType = null;
  let lastInjectedSignature = null;

  const logger = {
    log: (emoji, ...args) => console.log(`[${LOG_PREFIX}] ${emoji}`, ...args),
    error: (emoji, ...args) =>
      console.error(`[${LOG_PREFIX}] ${emoji}`, ...args),
    warn: (emoji, ...args) => console.warn(`[${LOG_PREFIX}] ${emoji}`, ...args),
  };

  logger.log('🚀', 'Main script started.');
  logger.log(
    '🔧',
    `Config: User=${GITHUB_USERNAME}, Repo=${GITHUB_REPONAME}, Branch=${GITHUB_BRANCH}`
  );

  function getSelectedValueFromPicker(selectorId) {
    const picker = document.getElementById(selectorId);
    if (picker) {
      const valueContainer = picker.querySelector(
        '.single-select__value-container, [class*="singleValue"], [class*="placeholder"]'
      );
      if (valueContainer && valueContainer.textContent) {
        return valueContainer.textContent.trim();
      }
      if (picker.value) return picker.value;
      if (picker.textContent) return picker.textContent.trim();
    }
    return null;
  }

  function extractProjectKey(projectText) {
    if (!projectText) return null;
    const match = projectText.match(/\(([^)]+)\)$/);
    if (match && match[1]) return match[1].toUpperCase();
    const parts = projectText.split(' ');
    if (parts.length > 1 && parts[parts.length - 1].length <= 4)
      return parts[parts.length - 1].toUpperCase();
    return projectText.split(' ')[0].toUpperCase();
  }

  function formatIssueType(issueTypeText) {
    if (!issueTypeText) return null;
    return issueTypeText.toUpperCase().replace(/\s+/g, '-');
  }

  function buildTemplateUrl(projKey, issType) {
    if (!projKey || !issType) return null;
    const fileName = `${projKey}_${issType}.json`;
    return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPONAME}/${GITHUB_BRANCH}/templates/${fileName}`;
  }

  function triggerInputEvent(element) {
    const eventInput = new Event('input', { bubbles: true, cancelable: true });
    const eventChange = new Event('change', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(eventInput);
    element.dispatchEvent(eventChange);
  }

  function findRichTextEditableArea(containerElement) {
    if (!containerElement) return null;
    for (const selector of RICH_TEXT_EDITABLE_AREA_SELECTORS) {
      const editableArea = containerElement.querySelector(selector);
      if (editableArea) {
        return editableArea;
      }
    }
    // Broader check if container itself is contenteditable and looks like an editor
    if (containerElement.matches('[contenteditable="true"][role="textbox"]')) {
      return containerElement;
    }
    return null;
  }

  function isRichTextEditorEmpty(editorElement) {
    if (!editorElement) return true;

    const placeholderNode = editorElement.querySelector(
      RICH_TEXT_PLACEHOLDER_SELECTOR
    );
    if (
      placeholderNode &&
      editorElement.contains(placeholderNode) &&
      placeholderNode.offsetParent !== null
    ) {
      // Check visibility
      logger.log(
        'ℹ️',
        `Rich text editor has visible placeholder, considering empty.`
      );
      return true;
    }
    if (editorElement.textContent.trim() === '') {
      logger.log(
        'ℹ️',
        `Rich text editor has no textContent, considering empty.`
      );
      return true;
    }

    const allParagraphs = editorElement.querySelectorAll('p');
    if (allParagraphs.length === 1) {
      const pContent = allParagraphs[0].innerHTML.trim().toLowerCase();
      if (
        pContent === '' ||
        pContent === '<br>' ||
        pContent.includes('prosemirror-trailingbreak') ||
        pContent === ' '
      ) {
        if (
          editorElement.querySelectorAll(
            'img, table, ul, ol, pre, blockquote, hr, li'
          ).length === 0
        ) {
          logger.log(
            'ℹ️',
            `Rich text editor has one empty <p>, considering empty.`
          );
          return true;
        }
      }
    }
    return false;
  }

  async function injectTemplate(templateData) {
    logger.log('🧠', 'Injecting template...', templateData);
    if (
      !templateData ||
      !templateData.fields ||
      !Array.isArray(templateData.fields)
    ) {
      logger.warn('⚠️', 'Template data is invalid or has no fields.');
      return;
    }

    templateData.fields.forEach((field) => {
      if (field.type !== 'text') {
        logger.warn(
          '🧐',
          `Unsupported field type "${field.type}" for field ID: ${field.id}. Skipping.`
        );
        return;
      }

      let targetElement = null;
      let isRichText = false;

      // Attempt 1: Direct ID or Name (mostly for simple fields)
      const directTarget =
        document.getElementById(field.id) ||
        document.querySelector(`[name="${field.id}"]`);

      if (directTarget) {
        if (
          directTarget.value !== undefined &&
          typeof directTarget.value === 'string' &&
          !directTarget.isContentEditable
        ) {
          targetElement = directTarget;
          isRichText = false;
          logger.log(
            'ℹ️',
            `Found standard input/textarea by ID/Name for "${field.id}".`
          );
        } else if (directTarget.isContentEditable) {
          // It's contenteditable, check if it's a rich text editor itself
          const rteArea = findRichTextEditableArea(directTarget);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
            logger.log(
              'ℹ️',
              `Found rich text editor by ID/Name (or it is the editor itself) for "${field.id}".`
            );
          } else {
            // Generic contenteditable found by ID/Name, but not matching specific RTE selectors
            targetElement = directTarget;
            isRichText = false; // Treat as generic contenteditable
            logger.log(
              'ℹ️',
              `Found generic contenteditable by ID/Name for "${field.id}".`
            );
          }
        }
      }

      // Attempt 2: Find by data-testid wrapper, then find RTE within it (more robust for complex fields)
      if (
        !targetElement ||
        (targetElement &&
          !isRichText &&
          field.id.toLowerCase().includes('description'))
      ) {
        // Prioritize this for "description" or similar
        // Construct a selector for the wrapper using the field.id
        // Example: if field.id is "description", look for data-testid containing "description-field.wrapper"
        // This requires field.id in template to be somewhat predictive or match a convention
        const wrapperSelector = `[data-testid*="${field.id}-field.wrapper"], [data-testid*="${field.id}.wrapper"]`;
        const fieldWrapper = document.querySelector(wrapperSelector);

        if (fieldWrapper) {
          logger.log(
            'ℹ️',
            `Found wrapper for "${field.id}" using selector: ${wrapperSelector}`
          );
          const rteArea = findRichTextEditableArea(fieldWrapper);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
            logger.log(
              'ℹ️',
              `Found rich text editor inside wrapper for "${field.id}".`
            );
          } else {
            logger.warn(
              '⚠️',
              `Found wrapper for "${field.id}", but no recognized rich text editor area inside.`
            );
            // If directTarget was a generic contenteditable, keep it.
            if (
              directTarget &&
              directTarget.isContentEditable &&
              !targetElement
            ) {
              targetElement = directTarget;
              isRichText = false; // It's a generic contenteditable, not a full RTE
            }
          }
        } else if (
          directTarget &&
          directTarget.isContentEditable &&
          !isRichText &&
          !targetElement
        ) {
          // If wrapper not found, but directTarget was a generic contenteditable, use that.
          targetElement = directTarget;
          isRichText = false; // Still generic contenteditable
        }
      }

      // If still no target, and it's likely description based on ID, try broader search inside common parents
      if (!targetElement && field.id.toLowerCase().includes('description')) {
        const commonDescriptionParent = document.querySelector(
          'form#issue-create\\.ui\\.modal\\.create-form div[data-testid*="description"]'
        );
        if (commonDescriptionParent) {
          const rteArea = findRichTextEditableArea(commonDescriptionParent);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
            logger.log(
              'ℹ️',
              `Found description rich text editor via common parent heuristic.`
            );
          }
        }
      }

      if (!targetElement) {
        logger.warn(
          '🤷',
          `Field target for ID/Name: "${field.id}" not found after all attempts.`
        );
        return;
      }

      // --- Apply Injection ---
      if (isRichText) {
        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${field.id} already has content, skipped.`
          );
          return;
        }
        logger.log(
          '✍️',
          `Attempting injection into rich text editor: ${field.id}`
        );
        const paragraphs = field.value.split('\n');
        let newHtml = '';
        paragraphs.forEach((paraText, index) => {
          const isLastParagraph = index === paragraphs.length - 1;
          if (paraText.trim() === '') {
            newHtml += `<p><br class="ProseMirror-trailingBreak"></p>`;
          } else {
            const escapedPara = paraText
              .replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>');
            newHtml += `<p>${escapedPara}${
              isLastParagraph ? '<br class="ProseMirror-trailingBreak">' : ''
            }</p>`;
          }
        });
        // Ensure there's at least one paragraph with a trailing break if template value is empty
        if (field.value.trim() === '') {
          newHtml = '<p><br class="ProseMirror-trailingBreak"></p>';
        }

        targetElement.innerHTML = newHtml;
        targetElement.focus();
        triggerInputEvent(targetElement);
        setTimeout(() => targetElement.blur(), 100); // Slightly longer delay for blur
        logger.log(
          '✅',
          `Successfully attempted injection into rich text editor: ${field.id}`
        );
      } else if (
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string'
      ) {
        // Standard <input> or <textarea> (not contentEditable, or generic contentEditable treated as simple input)
        if (targetElement.value.trim() === '') {
          targetElement.value = field.value;
          triggerInputEvent(targetElement);
          logger.log(
            '✍️',
            `Injected into standard input/textarea: ${field.id}`
          );
        } else {
          logger.log(
            '🤔',
            `Standard input/textarea: ${field.id} already has content, skipped.`
          );
        }
      } else if (targetElement.isContentEditable) {
        // Generic contentEditable div (fallback, if not identified as RTE or standard input)
        if (targetElement.textContent.trim() === '') {
          targetElement.textContent = field.value;
          triggerInputEvent(targetElement);
          logger.log(
            '✍️',
            `Injected into generic contentEditable: ${field.id}`
          );
        } else {
          logger.log(
            '🤔',
            `Generic contentEditable: ${field.id} already has content, skipped.`
          );
        }
      } else {
        logger.warn(
          '🤷',
          `Field: "${field.id}" found, but it's not a recognized input type for injection.`
        );
      }
    });
  }

  async function loadAndApplyTemplate() {
    const currentProjectText = getSelectedValueFromPicker(PROJECT_SELECTOR_ID);
    const currentIssueTypeText = getSelectedValueFromPicker(
      ISSUE_TYPE_SELECTOR_ID
    );

    projectKey = extractProjectKey(currentProjectText);
    issueType = formatIssueType(currentIssueTypeText);

    logger.log(
      'ℹ️',
      `Detected Project Text: "${currentProjectText}", Issue Type Text: "${currentIssueTypeText}"`
    );
    logger.log(
      '🔑',
      `Extracted Project Key: ${projectKey}, Formatted Issue Type: ${issueType}`
    );

    if (!projectKey || !issueType) {
      logger.warn(
        '❌',
        'Missing project key or issue type. Cannot load template.'
      );
      return;
    }

    const currentSignature = `${projectKey}_${issueType}`;
    if (lastInjectedSignature === currentSignature) {
      logger.log(
        '🧘',
        `Template for ${currentSignature} was already processed for this form instance. Skipping re-fetch.`
      );
      return;
    }

    const templateUrl = buildTemplateUrl(projectKey, issueType);
    if (!templateUrl) {
      logger.warn('❌', 'Could not build template URL.');
      return;
    }

    logger.log(
      '📦',
      `Attempting to load template for ${projectKey} / ${issueType} from ${templateUrl}`
    );

    try {
      const response = await fetch(templateUrl);
      if (response.ok) {
        const templateData = await response.json();
        logger.log('✅', 'Template loaded:', templateData);
        await injectTemplate(templateData); // injectTemplate is now async implicitly
        lastInjectedSignature = currentSignature;
      } else if (response.status === 404) {
        logger.warn(
          '🤷',
          `Template not found (404) for ${projectKey}_${issueType}.json. No template will be applied.`
        );
        lastInjectedSignature = null;
      } else {
        logger.error(
          '❌',
          `Error fetching template. Status: ${response.status}`,
          response
        );
        lastInjectedSignature = null;
      }
    } catch (error) {
      logger.error('❌', 'Error fetching or parsing template JSON:', error);
      lastInjectedSignature = null;
    }
  }

  function observeSelectors() {
    const projectSelector = document.getElementById(PROJECT_SELECTOR_ID);
    const issueTypeSelector = document.getElementById(ISSUE_TYPE_SELECTOR_ID);

    if (!projectSelector || !issueTypeSelector) {
      logger.error(
        '❌',
        'Project or Issue Type selector not found. Cannot observe changes.'
      );
      return;
    }

    logger.log('🔄', 'Observing project/issue type changes...');
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
    };

    const createObserverCallback = (logMessage, type) => (mutationsList) => {
      for (let mutation of mutationsList) {
        if (
          mutation.type === 'childList' ||
          mutation.type === 'characterData'
        ) {
          logger.log(logMessage, `${type} changed/detected.`);
          lastInjectedSignature = null;
          loadAndApplyTemplate();
          return;
        }
      }
    };

    const projectObserver = new MutationObserver(
      createObserverCallback('🔍', 'Project')
    );
    const issueTypeObserver = new MutationObserver(
      createObserverCallback('🏷️', 'Issue Type')
    );

    const projectValueContainer = projectSelector.querySelector(
      '.single-select__value-container, [class*="singleValue"]'
    );
    const issueTypeValueContainer = issueTypeSelector.querySelector(
      '.single-select__value-container, [class*="singleValue"]'
    );

    if (projectValueContainer)
      projectObserver.observe(projectValueContainer, observerConfig);
    else projectObserver.observe(projectSelector, observerConfig);

    if (issueTypeValueContainer)
      issueTypeObserver.observe(issueTypeValueContainer, observerConfig);
    else issueTypeObserver.observe(issueTypeSelector, observerConfig);

    loadAndApplyTemplate();
  }

  const modalObserver = new MutationObserver((mutationsList, observer) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const createForm = document.getElementById(CREATE_MODAL_ID);
        if (createForm && !createForm.dataset.jtiObserved) {
          logger.log('✅', 'Form is present:', CREATE_MODAL_ID);
          createForm.dataset.jtiObserved = 'true';
          lastInjectedSignature = null;
          setTimeout(observeSelectors, 700); // Slightly increased delay for complex forms to fully render
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          const oldForm = document.querySelector(`[data-jti-observed="true"]`);
          if (oldForm) delete oldForm.dataset.jtiObserved;
          logger.log(
            '🚪',
            'Form seems to have closed. Ready for next opening.'
          );
        }
      }
    }
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
  logger.log('👀', 'Observing document body for create modal...');
})();
