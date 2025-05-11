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
  const FIELD_PROCESS_DELAY_MS = 150;

  let currentTemplateData = null;
  let lastAttemptedSignature = null;
  let isConfirmationModalOpen = false; // Prevent multiple confirmation modals

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

  // --- Modal Utility ---
  function showConfirmationModal(fieldName, onInject, onKeep) {
    if (isConfirmationModalOpen) {
      logger.warn(
        '⚠️',
        'Confirmation modal already open. Ignoring new request.'
      );
      return Promise.reject('Modal already open'); // Or resolve immediately with 'keep'
    }
    isConfirmationModalOpen = true;

    return new Promise((resolve) => {
      const modalId = 'jti-confirmation-modal';
      const existingModal = document.getElementById(modalId);
      if (existingModal) existingModal.remove();

      const modalOverlay = document.createElement('div');
      modalOverlay.id = modalId + '-overlay';
      modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(9, 30, 66, 0.54); /* Atlassian overlay color */
            z-index: 5000; display: flex; align-items: center; justify-content: center;
        `;

      const modalDialog = document.createElement('div');
      modalDialog.id = modalId;
      modalDialog.style.cssText = `
            background-color: white;
            padding: 24px;
            border-radius: 3px; /* ADS border-radius */
            box-shadow: rgba(9, 30, 66, 0.25) 0px 20px 32px -8px, rgba(9, 30, 66, 0.08) 0px 0px 1px; /* ADS shadow */
            width: 400px;
            max-width: 90%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
            color: #172B4D; /* ADS text color */
        `;

      const title = document.createElement('h2');
      title.textContent = 'Template Injection';
      title.style.cssText =
        'font-size: 20px; font-weight: 500; margin-top: 0; margin-bottom: 12px; color: #091E42;'; // ADS Heading

      const message = document.createElement('p');
      message.innerHTML = `The "<strong>${fieldName}</strong>" field already contains data. <br>Injecting the template will overwrite this existing draft.`;
      message.style.cssText = 'margin-bottom: 24px; line-height: 1.5;';

      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText =
        'display: flex; justify-content: flex-end; gap: 8px;';

      const keepButton = document.createElement('button');
      keepButton.textContent = 'Keep Draft';
      keepButton.style.cssText = `
            background-color: #F4F5F7; /* ADS Button Neutral */
            color: #42526E;
            border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer; font-weight: 500;
        `;
      keepButton.onmouseover = () =>
        (keepButton.style.backgroundColor = '#EBECF0'); // Hover
      keepButton.onmouseout = () =>
        (keepButton.style.backgroundColor = '#F4F5F7');

      const injectButton = document.createElement('button');
      injectButton.textContent = 'Inject Template';
      injectButton.style.cssText = `
            background-color: #0052CC; /* ADS Button Primary */
            color: white;
            border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer; font-weight: 500;
        `;
      injectButton.onmouseover = () =>
        (injectButton.style.backgroundColor = '#0065FF'); // Hover
      injectButton.onmouseout = () =>
        (injectButton.style.backgroundColor = '#0052CC');

      const closeModal = (decision) => {
        modalOverlay.remove();
        isConfirmationModalOpen = false;
        if (decision === 'inject') {
          onInject();
        } else {
          onKeep();
        }
        resolve(decision);
      };

      keepButton.onclick = () => closeModal('keep');
      injectButton.onclick = () => closeModal('inject');
      modalOverlay.onclick = (e) => {
        // Close on overlay click
        if (e.target === modalOverlay) closeModal('keep');
      };

      // Handle Escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal('keep');
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);

      buttonGroup.appendChild(keepButton);
      buttonGroup.appendChild(injectButton);
      modalDialog.appendChild(title);
      modalDialog.appendChild(message);
      modalDialog.appendChild(buttonGroup);
      modalOverlay.appendChild(modalDialog);
      document.body.appendChild(modalOverlay);

      injectButton.focus(); // Focus the primary action
    });
  }

  // ... (rest of the helper functions: getSelectedValueFromPicker, extractProjectKey, etc. remain the same)
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
      return true; // Don't log here, let the caller decide context for logging
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
          pContent === ' ') && // Corrected non-breaking space
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
      // Note: Your current script only supports field.type "text".
      // If you add "select" or other types, this condition needs to be more inclusive
      // or the type-specific logic needs to be outside this initial type check.
      // For now, assuming all processable fields from template are 'text' for RTE/standard input.
      if (field.type !== 'text' && field.type !== 'select') {
        // Added select here if you plan to use it
        logger.warn(
          '🧐',
          `Unsupported field type "${field.type}" for field ID: ${field.id}. Skipping.`
        );
        continue;
      }

      let targetElement = null;
      let isRichText = false;
      // For 'select' type, targetElement will be the select control/wrapper.
      // For 'text' type, targetElement will be the input/textarea or RTE area.

      // TODO: REMOVE THIS
      logger.log(`[${field.id}] Attempting to find target...`);
      const directTargetByIdOrName =
        document.getElementById(field.id) ||
        document.querySelector(`[name="${field.id}"]`);
      logger.log(
        `[${field.id}] directTargetByIdOrName:`,
        directTargetByIdOrName
      );

      if (
        !targetElement ||
        (targetElement &&
          !isRichText &&
          field.id.toLowerCase().includes('description'))
      ) {
        const wrapperSelector = `[data-testid*="${field.id}-field.wrapper"], [data-testid*="${field.id}.wrapper"], [data-testid*="${field.id}"]`;
        const fieldWrapperByTestId = document.querySelector(wrapperSelector);
        logger.log(
          `[${field.id}] fieldWrapperByTestId (selector: ${wrapperSelector}):`,
          fieldWrapperByTestId
        );
      }

      // Last resort for "description"
      if (!targetElement && field.id.toLowerCase().includes('description')) {
        const descParentSelector =
          'form#issue-create\\.ui\\.modal\\.create-form div[data-testid*="description"]';
        const commonDescriptionParent =
          document.querySelector(descParentSelector);
        logger.log(
          `[${field.id}] commonDescriptionParent (selector: ${descParentSelector}):`,
          commonDescriptionParent
        );
      }

      logger.log(
        `[${field.id}] Final targetElement before injection logic:`,
        targetElement,
        `isRichText: ${isRichText}`
      );

      if (!targetElement) {
        logger.warn(
          '🤷',
          `[${field.id}] Field target for ID/Name: "${field.id}" not found after all attempts.`
        );
      }
      // TODO: REMOVE THIS

      // Simplified target finding logic from your provided script for brevity, assuming it works.
      // You'll need to integrate your more robust target finding here.
      const directTarget =
        document.getElementById(field.id) ||
        document.querySelector(`[name="${field.id}"]`);
      if (directTarget) {
        if (field.type === 'text') {
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
              isRichText = false; /* Generic CE */
            }
          }
        } else if (field.type === 'select') {
          targetElement = directTarget; // Or its wrapper, adapt as per your select logic
        }
      }
      // Add more robust target finding (wrapper-based, etc.) as you had before if needed.
      // This is a simplified placeholder for the finding logic.
      // For the description field:
      if (!targetElement && field.id.toLowerCase().includes('description')) {
        const commonDescParent = document.querySelector(
          'form#issue-create\\.ui\\.modal\\.create-form div[data-testid*="description"]'
        );
        if (commonDescParent) {
          const rteArea = findRichTextEditableArea(commonDescParent);
          if (rteArea) {
            targetElement = rteArea;
            isRichText = true; // Explicitly set for description if found this way
          }
        }
      }

      if (!targetElement) {
        logger.warn('🤷', `Field target for ID/Name: "${field.id}" not found.`);
        await new Promise((resolve) =>
          setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
        );
        continue;
      }

      // --- Apply Injection ---
      if (isRichText) {
        const injectRTEContent = () => {
          logger.log('✍️', `Injecting into rich text editor: ${field.id}`);
          const paragraphs = field.value.split('\n');
          let newHtml = '';
          paragraphs.forEach((paraText, index) => {
            const isLastParagraph = index === paragraphs.length - 1;
            // Corrected HTML entity escaping
            const escapedParaText = paraText
              .replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>');
            newHtml += `<p>${
              paraText.trim() === ''
                ? '<br class="ProseMirror-trailingBreak">'
                : escapedParaText // Use escaped text
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
            `Successfully injected into rich text editor: ${field.id}`
          );
        };

        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${field.id} already has content. Prompting user.`
          );
          try {
            const decision = await showConfirmationModal(
              field.displayName || field.id, // Use a displayName if available in template, else field.id
              injectRTEContent, // onInject callback
              () => {
                logger.log('🚫', `User chose to keep draft for ${field.id}.`);
              } // onKeep callback
            );
            // If modal resolves, action is taken by callbacks.
            if (decision === 'keep') {
              // Do nothing further for this field if "keep" was chosen explicitly by modal logic
            }
          } catch (error) {
            logger.warn(
              '⚠️',
              'Modal interaction issue or modal already open:',
              error
            );
            // Decide a default action, e.g., keep draft if modal fails
          }
        } else {
          logger.log(
            'ℹ️',
            `Rich text editor: ${field.id} is empty. Injecting directly.`
          );
          injectRTEContent();
        }
      } else if (
        targetElement.value !== undefined &&
        typeof targetElement.value === 'string'
      ) {
        // Standard text
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
            `Standard input/textarea: ${field.id} already has content, skipped (no prompt for simple fields).`
          );
        }
      } else if (targetElement.isContentEditable) {
        // Generic contentEditable (not identified as RTE)
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
      }
      // Add your 'select' type handling here if you re-integrate it
      // else if (field.type === "select") { ... await handleSelectField(...) ... }
      else {
        logger.warn(
          '🤷',
          `Field: "${field.id}" (type: ${field.type}) found, but not a recognized input type for injection logic here.`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
      );
    }
    logger.log('🏁', 'Finished applying template fields.');
  }

  // ... (loadAndApplyTemplate and the rest of the script)
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
        logger.warn(
          '🤷',
          `Template not found (404) for ${currentSignature}. No template will be applied.`
        );
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
    logger.log('🔄', 'Modal context change detected (project/issue type).');
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
          isConfirmationModalOpen = false; // Reset modal state when main Jira modal opens
          setTimeout(observeSelectors, 700);
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          const oldForm = document.querySelector(`[data-jti-observed="true"]`);
          if (oldForm) delete oldForm.dataset.jtiObserved;
          logger.log('🚪', 'Create issue form closed.');
          // Close any lingering confirmation modals if the main form closes
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
