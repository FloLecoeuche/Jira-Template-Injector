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

  // Use the EXACT data-testid you confirmed is consistent
  const DESCRIPTION_FIELD_WRAPPER_SELECTOR = `[data-testid="issue-create.common.ui.fields.description-field.wrapper"]`;

  const RICH_TEXT_EDITABLE_AREA_SELECTORS = [
    '.ProseMirror[role="textbox"][contenteditable="true"]',
    '#ak-editor-textarea[contenteditable="true"]', // This is often the one inside the wrapper
    'div[aria-label*="Main content area"][contenteditable="true"]',
    'div.ak-editor-content-area div[contenteditable="true"]',
  ];
  const RICH_TEXT_PLACEHOLDER_SELECTOR =
    'span[data-testid="placeholder-test-id"].placeholder-decoration';
  const FIELD_PROCESS_DELAY_MS = 200;

  let currentTemplateData = null;
  let lastAttemptedSignature = null;
  let isConfirmationModalOpen = false;

  const logger = {
    /* ... (no change) ... */
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

  // --- Modal Utility (showConfirmationModal) ---
  // ... (Keep your existing showConfirmationModal function as it is) ...
  function showConfirmationModal(fieldName, onInject, onKeep) {
    if (isConfirmationModalOpen) {
      logger.warn(
        '⚠️',
        'Confirmation modal already open. Ignoring new request.'
      );
      return Promise.resolve('keep');
    }
    isConfirmationModalOpen = true;
    return new Promise((resolve) => {
      const modalId = 'jti-confirmation-modal';
      const existingModal = document.getElementById(modalId);
      if (existingModal) existingModal.remove();
      const modalOverlay = document.createElement('div');
      modalOverlay.id = modalId + '-overlay';
      modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(9, 30, 66, 0.54); z-index: 5000; display: flex; align-items: center; justify-content: center;`;
      const modalDialog = document.createElement('div');
      modalDialog.id = modalId;
      modalDialog.style.cssText = `background-color: white; padding: 24px; border-radius: 3px; box-shadow: rgba(9, 30, 66, 0.25) 0px 20px 32px -8px, rgba(9, 30, 66, 0.08) 0px 0px 1px; width: 400px; max-width: 90%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; color: #172B4D;`;
      const title = document.createElement('h2');
      title.textContent = 'Template Injection';
      title.style.cssText =
        'font-size: 20px; font-weight: 500; margin-top: 0; margin-bottom: 12px; color: #091E42;';
      const message = document.createElement('p');
      message.innerHTML = `The "<strong>${fieldName}</strong>" field already contains data. <br>Injecting the template will overwrite this existing draft.`;
      message.style.cssText = 'margin-bottom: 24px; line-height: 1.5;';
      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText =
        'display: flex; justify-content: flex-end; gap: 8px;';
      const keepButton = document.createElement('button');
      keepButton.textContent = 'Keep Draft';
      keepButton.style.cssText = `background-color: #F4F5F7; color: #42526E; border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer; font-weight: 500;`;
      keepButton.onmouseover = () =>
        (keepButton.style.backgroundColor = '#EBECF0');
      keepButton.onmouseout = () =>
        (keepButton.style.backgroundColor = '#F4F5F7');
      const injectButton = document.createElement('button');
      injectButton.textContent = 'Inject Template';
      injectButton.style.cssText = `background-color: #0052CC; color: white; border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer; font-weight: 500;`;
      injectButton.onmouseover = () =>
        (injectButton.style.backgroundColor = '#0065FF');
      injectButton.onmouseout = () =>
        (injectButton.style.backgroundColor = '#0052CC');
      let escapeHandlerRef = null;
      const closeModal = (decision) => {
        modalOverlay.remove();
        isConfirmationModalOpen = false;
        if (escapeHandlerRef)
          document.removeEventListener('keydown', escapeHandlerRef);
        if (decision === 'inject') onInject();
        else onKeep();
        resolve(decision);
      };
      keepButton.onclick = () => closeModal('keep');
      injectButton.onclick = () => closeModal('inject');
      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) closeModal('keep');
      };
      escapeHandlerRef = (e) => {
        if (e.key === 'Escape') closeModal('keep');
      };
      document.addEventListener('keydown', escapeHandlerRef);
      buttonGroup.appendChild(keepButton);
      buttonGroup.appendChild(injectButton);
      modalDialog.appendChild(title);
      modalDialog.appendChild(message);
      modalDialog.appendChild(buttonGroup);
      modalOverlay.appendChild(modalDialog);
      document.body.appendChild(modalOverlay);
      injectButton.focus();
    });
  }

  // --- Helper Functions ---
  function getSelectedValueFromPicker(selectorId) {
    /* ... (no change) ... */
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
    /* ... (no change) ... */
    if (!projectText) return null;
    const match = projectText.match(/\(([^)]+)\)$/);
    if (match && match[1]) return match[1].toUpperCase();
    const parts = projectText.split(' ');
    if (parts.length > 1 && parts[parts.length - 1].length <= 4)
      return parts[parts.length - 1].toUpperCase();
    return projectText.split(' ')[0].toUpperCase();
  }
  function formatIssueType(issueTypeText) {
    /* ... (no change) ... */
    if (!issueTypeText) return null;
    return issueTypeText.toUpperCase().replace(/\s+/g, '-');
  }
  function buildTemplateUrl(projKey, issType) {
    /* ... (no change) ... */
    if (!projKey || !issType) return null;
    const fileName = `${projKey}_${issType}.json`;
    return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPONAME}/${GITHUB_BRANCH}/templates/${fileName}`;
  }
  function triggerInputEvent(element) {
    /* ... (no change) ... */
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
    /* ... (no change, ensure nbsp check is good) ... */
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
    if (editorElement.textContent.trim() === '') {
      return true;
    }
    const allParagraphs = editorElement.querySelectorAll('p');
    if (allParagraphs.length === 1) {
      const pContent = allParagraphs[0].innerHTML.trim().toLowerCase();
      if (
        (pContent === '' ||
          pContent === '<br>' ||
          pContent.includes('prosemirror-trailingbreak') ||
          pContent === ' ' ||
          pContent === '\u00a0') &&
        editorElement.querySelectorAll(
          'img, table, ul, ol, pre, blockquote, hr, li'
        ).length === 0
      ) {
        return true;
      }
    }
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
      if (field.type !== 'text' && field.type !== 'select') {
        // Assuming you might add 'select' later
        logger.warn(
          '🧐',
          `Unsupported field type "${field.type}" for field ID: ${field.id}. Skipping.`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
        );
        continue;
      }

      let targetElement = null;
      let isRichText = false;
      const fieldIdForLog = field.displayName || field.id;

      logger.log(`[${fieldIdForLog}] Processing field. Type: ${field.type}`);

      if (field.id.toLowerCase() === 'description' && field.type === 'text') {
        logger.log(
          `[${fieldIdForLog}] Attempting to find description field using specific wrapper selector.`
        );
        const descriptionWrapper = document.querySelector(
          DESCRIPTION_FIELD_WRAPPER_SELECTOR
        );
        if (descriptionWrapper) {
          logger.log(
            `[${fieldIdForLog}] Found description wrapper:`,
            descriptionWrapper
          );
          const rteArea = findRichTextEditableArea(descriptionWrapper);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true;
            logger.log(
              `[${fieldIdForLog}] Found RTE area inside description wrapper:`,
              targetElement
            );
          } else {
            logger.warn(
              `[${fieldIdForLog}] Description wrapper found, but NO RTE area inside.`
            );
          }
        } else {
          logger.warn(
            `[${fieldIdForLog}] Description wrapper NOT found using selector: ${DESCRIPTION_FIELD_WRAPPER_SELECTOR}`
          );
        }
      } else if (field.type === 'text') {
        // Generic text field (e.g., summary) or fallback if description specific search failed (though it shouldn't if selector is good)
        targetElement =
          document.getElementById(field.id) ||
          document.querySelector(`[name="${field.id}"]`);
        if (targetElement) {
          if (
            targetElement.value !== undefined &&
            typeof targetElement.value === 'string' &&
            !targetElement.isContentEditable
          ) {
            isRichText = false; // Standard input/textarea
          } else if (targetElement.isContentEditable) {
            const rteArea = findRichTextEditableArea(targetElement); // Check if this generic CE is actually an RTE
            if (rteArea) {
              targetElement = rteArea;
              isRichText = true;
            } else {
              isRichText = false; /* Generic CE */
            }
          } else {
            targetElement = null; // Not a suitable text input type
          }
        }
        logger.log(
          `[${fieldIdForLog}] Generic text field search found:`,
          targetElement
        );
      } else if (field.type === 'select') {
        // Placeholder for your select logic
        logger.log(
          `[${fieldIdForLog}] Select field type - target finding logic to be implemented.`
        );
        targetElement =
          document.getElementById(field.id) ||
          document.querySelector(`[data-testid*="${field.id}"]`); // Very basic attempt
      }

      if (!targetElement) {
        logger.warn('🤷', `[${fieldIdForLog}] Field target not found.`);
        await new Promise((resolve) =>
          setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
        );
        continue;
      }

      logger.log(
        `[${fieldIdForLog}] Final target determined:`,
        targetElement,
        `isRichText: ${isRichText}`
      );

      // --- Apply Injection ---
      if (isRichText) {
        const injectRTEContent = () => {
          logger.log('✍️', `Injecting into rich text editor: ${fieldIdForLog}`);
          const paragraphs = field.value.split('\n');
          let newHtml = '';
          paragraphs.forEach((paraText, index) => {
            const isLastParagraph = index === paragraphs.length - 1;
            const escapedParaText = paraText
              .replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>');
            newHtml += `<p>${
              paraText.trim() === ''
                ? '<br class="ProseMirror-trailingBreak">'
                : escapedParaText
            }${
              isLastParagraph ? '<br class="ProseMirror-trailingBreak">' : ''
            }</p>`;
          });
          if (field.value.trim() === '')
            newHtml = '<p><br class="ProseMirror-trailingBreak"></p>';
          targetElement.innerHTML = newHtml;
          targetElement.focus();
          triggerInputEvent(targetElement);
          logger.log(
            '✅',
            `Successfully injected into rich text editor: ${fieldIdForLog}`
          );
        };

        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${fieldIdForLog} already has content. Prompting user.`
          );
          try {
            await showConfirmationModal(fieldIdForLog, injectRTEContent, () => {
              logger.log(
                '🚫',
                `User chose to keep draft for ${fieldIdForLog}.`
              );
            });
          } catch (error) {
            logger.warn(
              '⚠️',
              `Modal interaction issue for ${fieldIdForLog}:`,
              error
            );
          }
        } else {
          logger.log(
            'ℹ️',
            `Rich text editor: ${fieldIdForLog} is empty. Injecting directly.`
          );
          injectRTEContent();
        }
      } else if (
        field.type === 'text' &&
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string'
      ) {
        if (targetElement.value.trim() === '') {
          targetElement.value = field.value;
          triggerInputEvent(targetElement);
          logger.log(
            '✍️',
            `Injected into standard input/textarea: ${fieldIdForLog}`
          );
        } else {
          logger.log(
            '🤔',
            `Standard input/textarea: ${fieldIdForLog} already has content, skipped.`
          );
        }
      } else if (field.type === 'text' && targetElement.isContentEditable) {
        if (targetElement.textContent.trim() === '') {
          targetElement.textContent = field.value;
          triggerInputEvent(targetElement);
          logger.log(
            '✍️',
            `Injected into generic contentEditable: ${fieldIdForLog}`
          );
        } else {
          logger.log(
            '🤔',
            `Generic contentEditable: ${fieldIdForLog} already has content, skipped.`
          );
        }
      } else if (field.type === 'select') {
        logger.log(
          'ℹ️',
          `Select field "${fieldIdForLog}" - injection logic to be implemented.`
        );
        // Example: await handleSelectField(targetElement, field.value);
      } else {
        logger.warn(
          '🤷',
          `Field: "${fieldIdForLog}" (type: ${field.type}) found, but no specific injection logic matched.`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
      );
    }
    logger.log('🏁', 'Finished applying template fields.');
  }

  // --- Core Logic ---
  async function loadAndApplyTemplate() {
    const currentProjectText = getSelectedValueFromPicker(PROJECT_SELECTOR_ID);
    const currentIssueTypeText = getSelectedValueFromPicker(
      ISSUE_TYPE_SELECTOR_ID
    );

    const pk = extractProjectKey(currentProjectText);
    const it = formatIssueType(currentIssueTypeText);

    // This log sequence is good for seeing the raw values right before extraction
    // logger.log('RAW Context:', { currentProjectText, currentIssueTypeText });
    logger.log(
      'ℹ️',
      `Context: Project Text="${currentProjectText}", Issue Type Text="${currentIssueTypeText}"`
    );
    logger.log('🔑', `Extracted: Project Key=${pk}, Issue Type=${it}`);

    if (!pk || !it) {
      // This case IS important. It means the user is likely transitioning between selections.
      // We should clear currentTemplateData so a subsequent valid selection forces a fresh load.
      logger.warn(
        '❌',
        'Project or Issue Type not fully selected/extracted. Clearing current template state.'
      );
      currentTemplateData = null;
      lastAttemptedSignature = `project-${pk}_issueType-${it}`; // Record this incomplete state attempt
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
          `No template for ${currentSignature} (matches last attempt, but no template was found).`
        );
      }
      return;
    }

    logger.log(
      '⏳',
      `New signature: ${currentSignature}. Resetting state and fetching template.`
    );
    lastAttemptedSignature = currentSignature;
    currentTemplateData = null;
    const templateUrl = buildTemplateUrl(pk, it);

    if (!templateUrl) {
      logger.warn('❌', 'Could not build template URL for new signature.');
      return;
    }

    logger.log(
      '📦',
      `Loading template for ${currentSignature} from ${templateUrl}`
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
      logger.error('❌', 'Error fetching/parsing template JSON:', error);
    }
  }

  function onModalContextChange() {
    logger.log('🔄', 'Modal context change detected.');
    // Add a very small delay to allow Jira's UI to potentially settle slightly after a picker change
    // before we try to read values and act.
    setTimeout(() => {
      loadAndApplyTemplate();
    }, 50); // 50ms delay
  }

  function observeSelectors() {
    const projectSelector = document.getElementById(PROJECT_SELECTOR_ID);
    const issueTypeSelector = document.getElementById(ISSUE_TYPE_SELECTOR_ID);

    if (!projectSelector || !issueTypeSelector) {
      logger.error(
        '❌',
        'Project or Issue Type selector DOM element not found.'
      );
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

    // Observe the specific value containers if they exist, otherwise the main pickers.
    if (projectValueContainer)
      projectObserver.observe(projectValueContainer, observerConfig);
    else {
      logger.warn(
        'Project value container not found, observing main project selector.'
      );
      projectObserver.observe(projectSelector, observerConfig);
    }

    if (issueTypeValueContainer)
      issueTypeObserver.observe(issueTypeValueContainer, observerConfig);
    else {
      logger.warn(
        'Issue Type value container not found, observing main issue type selector.'
      );
      issueTypeObserver.observe(issueTypeSelector, observerConfig);
    }

    logger.log(
      '🚀',
      'Initial call to loadAndApplyTemplate from observeSelectors.'
    );
    loadAndApplyTemplate();
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
          isConfirmationModalOpen = false;
          setTimeout(observeSelectors, 800);
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          const oldForm = document.querySelector(`[data-jti-observed="true"]`);
          if (oldForm) delete oldForm.dataset.jtiObserved;
          logger.log('🚪', 'Create issue form closed.');
          const confirmModalOverlay = document.getElementById(
            'jti-confirmation-modal-overlay'
          );
          if (confirmModalOverlay) confirmModalOverlay.remove();
          isConfirmationModalOpen = false;
        }
      }
    }
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
  logger.log('👀', 'Observing document body for create modal...');
})();
