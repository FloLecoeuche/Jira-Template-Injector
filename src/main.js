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
  const FIELD_PROCESS_DELAY_MS = 200; // Increased slightly for select interactions
  const SELECT_OPTIONS_TIMEOUT_MS = 5000; // Max time to wait for select options to appear

  let currentTemplateData = null;
  let lastAttemptedSignature = null;

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

  // ... (getSelectedValueFromPicker, extractProjectKey, formatIssueType, buildTemplateUrl, triggerInputEvent remain the same) ...
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
    // For text inputs, ensure 'input' and 'change' are fired
    if (element.value !== undefined || element.isContentEditable) {
      const eventInput = new Event('input', {
        bubbles: true,
        cancelable: true,
      });
      const eventChange = new Event('change', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(eventInput);
      element.dispatchEvent(eventChange);
    }
    // For other elements like select options, a click is usually enough
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
      return true;
    }
    if (editorElement.textContent.trim() === '') return true;
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
        return true;
      }
    }
    return false;
  }

  async function waitForElement(
    selector,
    baseElement = document,
    timeout = 5000
  ) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const element = baseElement.querySelector(selector);
        if (element) {
          clearInterval(interval);
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          logger.warn('⏳', `Timeout waiting for element: ${selector}`);
          reject(new Error(`Timeout waiting for element: ${selector}`));
        }
      }, 100);
    });
  }

  async function handleSelectField(fieldControl, desiredValueText) {
    logger.log(
      '🖱️',
      `Handling select field. Attempting to set to: "${desiredValueText}"`
    );

    // Check current value first. Jira select might show current value directly.
    // The provided DOM shows: <div data-testid="issue-field-select-base.ui.format-option-label.c-label">Unprioritized</div>
    const currentValueDisplay = fieldControl.querySelector(
      '[data-testid*="format-option-label"], .css-1c8bys3-singleValue > div > div:last-child'
    ); // More general
    if (
      currentValueDisplay &&
      currentValueDisplay.textContent.trim() === desiredValueText
    ) {
      logger.log(
        '👍',
        `Select field already set to "${desiredValueText}". Skipping.`
      );
      return true;
    }

    // Click the control to open the dropdown.
    // The input inside the control is often the focus/click target.
    const clickablePart =
      fieldControl.querySelector(
        'input[role="combobox"], .css-1vrwmt7-control, div[class*="-control"]'
      ) || fieldControl;
    if (!clickablePart) {
      logger.error('❌', 'Cannot find clickable part of the select control.');
      return false;
    }
    logger.log('🔵', 'Clicking select control to open options:', clickablePart);
    clickablePart.click();
    clickablePart.focus(); // Sometimes helps

    // Options are typically in a menu that's appended to body or a portal.
    // Common selectors for React Select menus: div[class*="-menu"], div[id^="react-select-"][id*="-listbox"]
    // And options: div[class*="-option"], div[role="option"]
    let optionsListContainer;
    try {
      // Wait for a menu list to appear. This is often globally positioned.
      optionsListContainer = await waitForElement(
        'div[class*="-menu"] div[class*="-listbox"], div[id^="react-select-"][id*="-listbox"]',
        document.body,
        SELECT_OPTIONS_TIMEOUT_MS
      );
      logger.log('📜', 'Options list container found:', optionsListContainer);
    } catch (e) {
      logger.error(
        '❌',
        'Could not find options list for select after clicking.'
      );
      // Attempt to close the dropdown if it seems stuck open (by clicking outside or pressing Escape)
      document.body.click(); // Click outside
      return false;
    }

    let optionFound = false;
    const options = optionsListContainer.querySelectorAll(
      'div[class*="-option"], div[role="option"]'
    );
    logger.log('🔎', `Found ${options.length} options in the list.`);

    for (const option of options) {
      // Option text might be nested. Let's be robust.
      const optionTextContent = (option.textContent || '').trim();
      logger.log('💬', `Checking option: "${optionTextContent}"`);
      if (optionTextContent.toLowerCase() === desiredValueText.toLowerCase()) {
        logger.log(
          '🎯',
          `Found matching option: "${optionTextContent}". Clicking...`
        );
        option.click();
        optionFound = true;
        // Wait a moment for Jira to process the selection
        await new Promise((resolve) => setTimeout(resolve, 200));
        break;
      }
    }

    if (!optionFound) {
      logger.warn(
        '⚠️',
        `Desired option "${desiredValueText}" not found in the list.`
      );
      // Attempt to close the dropdown by clicking the control again or an escape key
      clickablePart.click(); // This might close it
      return false;
    }

    // Trigger a change event on the original input if possible, though click usually handles it.
    const inputElement = fieldControl.querySelector(
      'input[id*="${field.id}"], input[role="combobox"]'
    );
    if (inputElement) triggerInputEvent(inputElement);

    return true;
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
      let targetElement = null; // This will be the primary element to interact with (e.g., input, textarea, select wrapper)
      let isRichText = false;
      let isSelect = field.type === 'select';

      // --- Find the target element ---
      // Attempt 1: Direct ID or Name (for simple inputs or the select's hidden input/wrapper)
      const directTargetByIdOrName =
        document.getElementById(field.id) ||
        document.querySelector(`[name="${field.id}"]`);

      if (directTargetByIdOrName) {
        targetElement = directTargetByIdOrName;
        logger.log(
          'ℹ️',
          `Found element by ID/Name for "${field.id}":`,
          targetElement
        );
      }

      // Attempt 2: Using data-testid for wrappers (especially for complex fields like RTE or Selects)
      // The `field.id` in the template should ideally match a key part of the testid.
      // E.g., if field.id is "priority", look for `data-testid*="priority-field.wrapper"`
      const wrapperSelector = `[data-testid*="${field.id}.wrapper"], [data-testid*="${field.id}"]`;
      const fieldWrapperByTestId = document.querySelector(wrapperSelector);

      if (fieldWrapperByTestId) {
        // If this is for a select, the wrapper itself might be what we need to interact with.
        // For RTE, we need to find the editable area inside.
        if (isSelect) {
          // If directTarget already found (e.g. input#priority-field), we might prefer fieldWrapperByTestId if it's the main control
          // Let's assume fieldWrapperByTestId is the better container for select interaction
          targetElement = fieldWrapperByTestId;
          logger.log(
            'ℹ️',
            `Using field wrapper (found by data-testid) for select "${field.id}":`,
            targetElement
          );
        } else if (!isSelect) {
          // For text/RTE
          const rteArea = findRichTextEditableArea(fieldWrapperByTestId);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
            logger.log(
              'ℹ️',
              `Found RTE inside wrapper for "${field.id}":`,
              targetElement
            );
          } else if (
            !targetElement &&
            directTargetByIdOrName &&
            directTargetByIdOrName.isContentEditable
          ) {
            targetElement = directTargetByIdOrName; // Fallback to direct if it was CE
            isRichText = false; // Generic CE
          } else if (!targetElement) {
            // If direct was not found/suitable
            targetElement = fieldWrapperByTestId; // Could be a generic CE wrapper
            isRichText = findRichTextEditableArea(targetElement) ? true : false;
          }
        }
      } else if (directTargetByIdOrName) {
        // If no wrapper by testid, stick with directTarget if it was found
        targetElement = directTargetByIdOrName;
        if (
          isSelect &&
          targetElement.tagName !== 'DIV' &&
          targetElement.parentNode.closest('div[class*="-container"]')
        ) {
          // If direct target is input and it's inside a select container, use the container.
          targetElement = targetElement.parentNode.closest(
            'div[class*="-container"]'
          );
          logger.log(
            'ℹ️',
            `Adjusted select target to container for "${field.id}":`,
            targetElement
          );
        } else if (!isSelect && targetElement.isContentEditable) {
          const rteArea = findRichTextEditableArea(targetElement);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
          } else {
            isRichText = false; /* generic CE */
          }
        }
      }

      if (!targetElement) {
        logger.warn(
          '🤷',
          `Field target for ID: "${field.id}" (type: ${field.type}) not found.`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
        ); // Still delay
        continue;
      }

      // --- Apply Injection based on type ---
      if (isSelect) {
        // `targetElement` should be the control wrapper for the select.
        // e.g. <div class="css-7fndq3-container"> or <div class="css-1vrwmt7-control">
        // The DOM you provided has `id="priority-field"` on the input *inside* the control.
        // `handleSelectField` needs the main control element.
        // Let's try to find the control based on common Jira select structures.
        let selectControlElement = targetElement;
        if (targetElement.matches('input[role="combobox"]')) {
          // If targetElement is the input itself
          selectControlElement = targetElement.closest(
            'div[class*="-control"], div[class*="-container"]'
          );
        } else if (
          !targetElement.querySelector('input[role="combobox"]') &&
          !targetElement.matches('div[class*="-control"]')
        ) {
          // If targetElement is a wrapper, try to find the control inside or assume it is the control
          selectControlElement =
            targetElement.querySelector(
              'div[class*="-control"], div[class*="-container"]'
            ) || targetElement;
        }
        if (!selectControlElement) {
          logger.error(
            '❌',
            `Could not determine the main control element for select field "${field.id}".`
          );
          continue;
        }
        await handleSelectField(selectControlElement, field.value);
      } else if (isRichText) {
        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${field.id} already has content, skipped.`
          );
        } else {
          logger.log('✍️', `Injecting into rich text editor: ${field.id}`);
          const paragraphs = field.value.split('\n');
          let newHtml = '';
          paragraphs.forEach((paraText, index) => {
            const isLast = index === paragraphs.length - 1;
            newHtml += `<p>${
              paraText.trim() === ''
                ? '<br class="ProseMirror-trailingBreak">'
                : paraText
                    .replace(/&/g, '&')
                    .replace(/</g, '<')
                    .replace(/>/g, '>')
            }${isLast ? '<br class="ProseMirror-trailingBreak">' : ''}</p>`;
          });
          if (field.value.trim() === '')
            newHtml = '<p><br class="ProseMirror-trailingBreak"></p>';

          targetElement.innerHTML = newHtml;
          targetElement.focus();
          triggerInputEvent(targetElement);
          logger.log(
            '✅',
            `Successfully injected into rich text editor: ${field.id}`
          );
        }
      } else if (
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string'
      ) {
        // Standard text input/textarea
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
        // Generic contentEditable
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

      await new Promise((resolve) =>
        setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
      );
    }
    logger.log('🏁', 'Finished applying template fields.');
  }

  // ... (loadAndApplyTemplate, onModalContextChange, observeSelectors, modalObserver remain the same) ...
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
      currentTemplateData = null;
      lastAttemptedSignature = `${pk}_${it}`;
      return;
    }

    const currentSignature = `${pk}_${it}`;

    if (lastAttemptedSignature === currentSignature) {
      if (currentTemplateData) {
        logger.log(
          '🔄',
          `Re-applying stored template for ${currentSignature}.`
        );
        await applyTemplateToFields(currentTemplateData);
      } else {
        logger.log(
          '🚫',
          `No template was found for ${currentSignature} during last attempt. Doing nothing.`
        );
      }
      return;
    }

    lastAttemptedSignature = currentSignature;
    currentTemplateData = null;
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
        currentTemplateData = template;
        await applyTemplateToFields(currentTemplateData);
      } else if (response.status === 404) {
        logger.warn('🤷', `Template not found (404) for ${currentSignature}.`);
      } else {
        logger.error(
          '❌',
          `Error fetching template. Status: ${response.status}`,
          response
        );
      }
    } catch (error) {
      logger.error('❌', 'Error fetching or parsing template JSON:', error);
    }
  }

  function onModalContextChange() {
    logger.log('🔄', 'Modal context change detected.');
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

    loadAndApplyTemplate(); // Initial load
  }

  const modalObserver = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const createForm = document.getElementById(CREATE_MODAL_ID);
        if (createForm && !createForm.dataset.jtiObserved) {
          logger.log('✅', 'Create issue form is present.');
          createForm.dataset.jtiObserved = 'true';
          lastAttemptedSignature = null;
          currentTemplateData = null;
          setTimeout(observeSelectors, 700);
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          const oldForm = document.querySelector(`[data-jti-observed="true"]`);
          if (oldForm) delete oldForm.dataset.jtiObserved;
          logger.log('🚪', 'Create issue form closed.');
        }
      }
    }
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
  logger.log('👀', 'Observing document body for create modal...');
})();
