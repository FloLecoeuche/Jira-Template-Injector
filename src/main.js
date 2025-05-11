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
  // Selectors for detecting rich text editors (e.g., ProseMirror)
  const RICH_TEXT_EDITOR_SELECTORS = [
    '.ProseMirror[role="textbox"][contenteditable="true"]',
    '#ak-editor-textarea[contenteditable="true"]', // Often specific to Jira's editor
    'div[data-testid*="rich-text"][contenteditable="true"]', // More generic testid
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

  function isRichTextEditor(element) {
    if (!element || !element.matches) return false;
    for (const selector of RICH_TEXT_EDITOR_SELECTORS) {
      if (element.matches(selector)) {
        return true;
      }
    }
    // Fallback: if it's a div, contenteditable, and has a role of textbox, good chance it's an RTE
    if (
      element.tagName === 'DIV' &&
      element.isContentEditable &&
      element.getAttribute('role') === 'textbox'
    ) {
      return true;
    }
    return false;
  }

  function isRichTextEditorEmpty(editorElement) {
    if (!editorElement) return true; // If no element, consider it "empty" for safety

    const placeholderNode = editorElement.querySelector(
      RICH_TEXT_PLACEHOLDER_SELECTOR
    );
    if (placeholderNode && editorElement.contains(placeholderNode)) {
      logger.log('ℹ️', `Rich text editor has placeholder, considering empty.`);
      return true;
    }
    if (editorElement.textContent.trim() === '') {
      logger.log(
        'ℹ️',
        `Rich text editor has no textContent, considering empty.`
      );
      return true;
    }

    // Check for a single, effectively empty paragraph
    const allParagraphs = editorElement.querySelectorAll('p');
    if (allParagraphs.length === 1) {
      const pContent = allParagraphs[0].innerHTML.trim().toLowerCase();
      // Check for common empty paragraph structures
      if (
        pContent === '' ||
        pContent === '<br>' ||
        pContent.includes('prosemirror-trailingbreak') ||
        pContent === ' '
      ) {
        // Ensure no other significant content like images, tables, lists exists
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
    return false; // If none of the above, assume it has content
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
        return; // continue to next field
      }

      let targetElement =
        document.getElementById(field.id) ||
        document.querySelector(`[name="${field.id}"]`);

      if (!targetElement) {
        // Special case: some rich text editors might not have a simple id/name on the main editable div,
        // but rather on a wrapper. Let's try to find a rich text editor within the field's general area
        // if the primary targetElement isn't found or isn't suitable.
        // This is heuristic and might need refinement based on Jira's structure.
        const fieldWrapper = document.querySelector(
          `[data-testid*="${field.id}"], [aria-labelledby*="${field.id}"]`
        );
        if (fieldWrapper) {
          for (const selector of RICH_TEXT_EDITOR_SELECTORS) {
            const rteInWrapper = fieldWrapper.querySelector(selector);
            if (rteInWrapper) {
              targetElement = rteInWrapper;
              logger.log(
                'ℹ️',
                `Found rich text editor for "${field.id}" within a wrapper.`
              );
              break;
            }
          }
        }
      }

      if (!targetElement) {
        logger.warn('🤷', `Field target for ID/Name: "${field.id}" not found.`);
        return; // continue to next field
      }

      // Determine injection strategy
      if (
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string' &&
        !targetElement.isContentEditable
      ) {
        // --- Standard <input> or <textarea> Handling (not contentEditable) ---
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
      } else if (isRichTextEditor(targetElement)) {
        // --- Rich Text Editor Handling (e.g., ProseMirror) ---
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
        if (
          paragraphs.length === 0 ||
          (paragraphs.length === 1 && paragraphs[0].trim() === '')
        ) {
          newHtml = '<p><br class="ProseMirror-trailingBreak"></p>'; // Ensure a trailingBreak for some editors
        } else {
          paragraphs.forEach((paraText) => {
            if (paraText.trim() === '') {
              newHtml += '<p><br class="ProseMirror-trailingBreak"></p>';
            } else {
              const escapedPara = paraText
                .replace(/&/g, '&')
                .replace(/</g, '<')
                .replace(/>/g, '>');
              newHtml += `<p>${escapedPara}</p>`;
            }
          });
        }
        // Ensure the last paragraph also has a trailing break if it's the common pattern
        if (
          newHtml.endsWith('</p>') &&
          !newHtml.endsWith('<br class="ProseMirror-trailingBreak"></p>')
        ) {
          const lastPIndex = newHtml.lastIndexOf('</p>');
          newHtml =
            newHtml.substring(0, lastPIndex) +
            '<br class="ProseMirror-trailingBreak"></p>';
        }

        targetElement.innerHTML = newHtml;

        targetElement.focus();
        triggerInputEvent(targetElement);
        // A small delay before blur can sometimes help ensure events propagate
        setTimeout(() => targetElement.blur(), 50);
        logger.log(
          '✅',
          `Successfully attempted injection into rich text editor: ${field.id}`
        );
      } else if (targetElement.isContentEditable) {
        // --- Generic contentEditable div (fallback) ---
        if (targetElement.textContent.trim() === '') {
          // For simple contentEditable, textContent is often fine.
          // For multi-line, we might want to insert <p> or <br> but it's less predictable
          // than with known rich editors.
          targetElement.textContent = field.value; // Simpler injection for generic contentEditable
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
        await injectTemplate(templateData);
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
          lastInjectedSignature = null; // Allow re-injection
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

    loadAndApplyTemplate(); // Initial call
  }

  const modalObserver = new MutationObserver((mutationsList, observer) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const createForm = document.getElementById(CREATE_MODAL_ID);
        if (createForm && !createForm.dataset.jtiObserved) {
          logger.log('✅', 'Form is present:', CREATE_MODAL_ID);
          createForm.dataset.jtiObserved = 'true';
          lastInjectedSignature = null;
          setTimeout(observeSelectors, 500);
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
