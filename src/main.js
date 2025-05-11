// This script is intended to be loaded by the Tampermonkey loader.
// It does not contain Tampermonkey headers.

(function () {
  'use strict';

  const LOG_PREFIX = 'JTI';

  const CREATE_MODAL_ID = 'issue-create.ui.modal.create-form';
  const PROJECT_SELECTOR_ID =
    'issue-create.ui.modal.create-form.project-picker.project-select';
  const ISSUE_TYPE_SELECTOR_ID =
    'issue-create.ui.modal.create-form.type-picker.issue-type-select';

  const RICH_TEXT_EDITABLE_AREA_SELECTORS = [
    '.ProseMirror[role="textbox"][contenteditable="true"]',
    '#ak-editor-textarea[contenteditable="true"]',
    'div[aria-label*="Main content area"][contenteditable="true"]',
    'div.ak-editor-content-area div[contenteditable="true"]',
  ];
  const RICH_TEXT_PLACEHOLDER_SELECTOR =
    'span[data-testid="placeholder-test-id"].placeholder-decoration';
  const FIELD_PROCESS_DELAY_MS = 150; // Delay between processing each field in a template

  let projectKey = null;
  let issueType = null;
  let currentTemplateData = null; // Store the currently relevant template data
  let lastAttemptedSignature = null; // Tracks the last combo we TRIED to load for

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
      if (valueContainer && valueContainer.textContent)
        return valueContainer.textContent.trim();
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
      if (editableArea) return editableArea;
    }
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
      logger.log('ℹ️', `RTE empty: visible placeholder.`);
      return true;
    }
    if (editorElement.textContent.trim() === '') {
      logger.log('ℹ️', `RTE empty: no textContent.`);
      return true;
    }
    const allParagraphs = editorElement.querySelectorAll('p');
    if (allParagraphs.length === 1) {
      const pContent = allParagraphs[0].innerHTML.trim().toLowerCase();
      if (
        (pContent === '' ||
          pContent === '<br>' ||
          pContent.includes('prosemirror-trailingbreak') ||
          pContent === ' ') &&
        editorElement.querySelectorAll(
          'img, table, ul, ol, pre, blockquote, hr, li'
        ).length === 0
      ) {
        logger.log('ℹ️', `RTE empty: one empty <p>.`);
        return true;
      }
    }
    logger.log(
      'ℹ️',
      `RTE considered NOT empty. Content: "${editorElement.textContent.substring(
        0,
        50
      )}..."`
    );
    return false;
  }

  async function applyTemplateToFields(template) {
    if (!template || !template.fields || !Array.isArray(template.fields)) {
      logger.warn(
        '⚠️',
        'applyTemplateToFields: Invalid or no template data provided.'
      );
      return;
    }
    logger.log('🧠', 'Applying template to fields...', template);

    for (const field of template.fields) {
      if (field.type !== 'text') {
        logger.warn(
          '🧐',
          `Unsupported field type "${field.type}" for field ID: ${field.id}. Skipping.`
        );
        continue;
      }

      let targetElement = null;
      let isRichText = false;

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
        } else if (directTarget.isContentEditable) {
          const rteArea = findRichTextEditableArea(directTarget);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
          } else {
            targetElement = directTarget;
            isRichText = false; // Generic contenteditable
          }
        }
      }

      if (!targetElement) {
        const wrapperSelector = `[data-testid*="${field.id}-field.wrapper"], [data-testid*="${field.id}.wrapper"]`;
        const fieldWrapper = document.querySelector(wrapperSelector);
        if (fieldWrapper) {
          const rteArea = findRichTextEditableArea(fieldWrapper);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
          } else if (directTarget && directTarget.isContentEditable) {
            // Fallback to direct if wrapper has no RTE
            targetElement = directTarget;
            isRichText = false;
          }
        } else if (directTarget && directTarget.isContentEditable) {
          // Fallback if no wrapper, but direct was CE
          targetElement = directTarget;
          isRichText = false;
        }
      }
      // Last resort for "description"
      if (!targetElement && field.id.toLowerCase().includes('description')) {
        const commonDescParent = document.querySelector(
          'form#issue-create\\.ui\\.modal\\.create-form div[data-testid*="description"]'
        );
        if (commonDescParent) {
          const rteArea = findRichTextEditableArea(commonDescParent);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
          }
        }
      }

      if (!targetElement) {
        logger.warn('🤷', `Field target for ID/Name: "${field.id}" not found.`);
        continue;
      }

      // --- Apply Injection ---
      if (isRichText) {
        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${field.id} already has content, skipped.`
          );
          continue;
        }
        logger.log('✍️', `Injecting into rich text editor: ${field.id}`);
        const paragraphs = field.value.split('\n');
        let newHtml = '';
        paragraphs.forEach((paraText, index) => {
          const isLastParagraph = index === paragraphs.length - 1;
          newHtml += `<p>${
            paraText.trim() === ''
              ? '<br class="ProseMirror-trailingBreak">'
              : paraText
                  .replace(/&/g, '&')
                  .replace(/</g, '<')
                  .replace(/>/g, '>')
          }${
            isLastParagraph ? '<br class="ProseMirror-trailingBreak">' : ''
          }</p>`;
        });
        if (field.value.trim() === '')
          newHtml = '<p><br class="ProseMirror-trailingBreak"></p>';

        targetElement.innerHTML = newHtml;
        targetElement.focus(); // Focus before event trigger
        triggerInputEvent(targetElement);
        // No blur here, let the natural flow or next field focus handle it to reduce interference
        logger.log(
          '✅',
          `Successfully injected into rich text editor: ${field.id}`
        );
      } else if (
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string'
      ) {
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
          `Field: "${field.id}" found, but not a recognized input type for injection.`
        );
      }

      // Delay before processing the next field
      await new Promise((resolve) =>
        setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
      );
    }
    logger.log('🏁', 'Finished applying template fields.');
  }

  async function loadAndApplyTemplate() {
    const currentProjectText = getSelectedValueFromPicker(PROJECT_SELECTOR_ID);
    const currentIssueTypeText = getSelectedValueFromPicker(
      ISSUE_TYPE_SELECTOR_ID
    );

    const pk = extractProjectKey(currentProjectText);
    const it = formatIssueType(currentIssueTypeText);

    logger.log(
      'ℹ️',
      `Context: Project Text="${currentProjectText}", Issue Type Text="${currentIssueTypeText}"`
    );
    logger.log('🔑', `Extracted: Project Key=${pk}, Issue Type=${it}`);

    if (!pk || !it) {
      logger.warn(
        '❌',
        'Missing project key or issue type. Clearing current template.'
      );
      currentTemplateData = null; // Clear any existing template
      lastAttemptedSignature = `${pk}_${it}`; // Still note what we tried
      return;
    }

    const currentSignature = `${pk}_${it}`;

    // If the signature is the same as the last one we ATTEMPTED to load,
    // and we successfully got template data for it, then apply it.
    // Otherwise, we need to fetch.
    if (lastAttemptedSignature === currentSignature) {
      if (currentTemplateData) {
        logger.log(
          '🔄',
          `Re-applying stored template for ${currentSignature} as context matches last attempt.`
        );
        await applyTemplateToFields(currentTemplateData);
      } else {
        logger.log(
          '🚫',
          `Context ${currentSignature} matches last attempt, but no template was found then. Doing nothing.`
        );
      }
      return;
    }

    // New signature or different from last attempt, so we must fetch.
    lastAttemptedSignature = currentSignature; // Update last attempted signature
    currentTemplateData = null; // Reset current template data before fetching
    const templateUrl = buildTemplateUrl(pk, it);

    if (!templateUrl) {
      logger.warn('❌', 'Could not build template URL.');
      return;
    }

    logger.log(
      '📦',
      `Attempting to load template for ${currentSignature} from ${templateUrl}`
    );

    try {
      const response = await fetch(templateUrl);
      if (response.ok) {
        const template = await response.json();
        logger.log('✅', 'Template loaded successfully:', template);
        currentTemplateData = template; // Store it
        await applyTemplateToFields(currentTemplateData);
      } else if (response.status === 404) {
        logger.warn(
          '🤷',
          `Template not found (404) for ${currentSignature}. No template will be applied.`
        );
        // currentTemplateData remains null
      } else {
        logger.error(
          '❌',
          `Error fetching template. Status: ${response.status}`,
          response
        );
        // currentTemplateData remains null
      }
    } catch (error) {
      logger.error('❌', 'Error fetching or parsing template JSON:', error);
      // currentTemplateData remains null
    }
  }

  function onModalContextChange() {
    logger.log('🔄', 'Modal context change detected (project/issue type).');
    // No need to reset lastAttemptedSignature here, loadAndApplyTemplate will handle it.
    loadAndApplyTemplate();
  }

  function observeSelectors() {
    const projectSelector = document.getElementById(PROJECT_SELECTOR_ID);
    const issueTypeSelector = document.getElementById(ISSUE_TYPE_SELECTOR_ID);

    if (!projectSelector || !issueTypeSelector) {
      logger.error('❌', 'Project or Issue Type selector not found.');
      return;
    }

    logger.log('🔍', 'Observing project/issue type selectors...');
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false,
    };

    const projectObserver = new MutationObserver(onModalContextChange);
    const issueTypeObserver = new MutationObserver(onModalContextChange);

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

    // Initial load when modal opens and selectors are first observed
    loadAndApplyTemplate();
  }

  const modalObserver = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const createForm = document.getElementById(CREATE_MODAL_ID);
        if (createForm && !createForm.dataset.jtiObserved) {
          logger.log('✅', 'Create issue form is present.');
          createForm.dataset.jtiObserved = 'true';
          lastAttemptedSignature = null; // Reset for a new modal instance
          currentTemplateData = null;
          setTimeout(observeSelectors, 700);
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          const oldForm = document.querySelector(`[data-jti-observed="true"]`);
          if (oldForm) delete oldForm.dataset.jtiObserved;
          logger.log('🚪', 'Create issue form closed.');
          // Optionally disconnect project/issueType observers here if they were stored globally
        }
      }
    }
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
  logger.log('👀', 'Observing document body for create modal...');
})();
