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

  const OUTER_FIELD_WRAPPER_TESTID_PREFIX =
    'issue-create.ui.modal.create-form.layout-renderer.field-renderer.field.';
  const INNER_RTE_WRAPPER_SELECTOR = `[data-testid="issue-create.common.ui.fields.description-field.wrapper"]`;

  const RICH_TEXT_EDITABLE_AREA_SELECTORS = [
    '.ProseMirror[role="textbox"][contenteditable="true"]',
    '#ak-editor-textarea[contenteditable="true"]',
    'div[aria-label*="Main content area"][contenteditable="true"]',
    'div.ak-editor-content-area div[contenteditable="true"]',
  ];
  const RICH_TEXT_PLACEHOLDER_SELECTOR =
    'span[data-testid="placeholder-test-id"].placeholder-decoration';
  const FIELD_PROCESS_DELAY_MS = 50; // Delay between processing each field
  const RTE_LINE_TYPING_DELAY_MS = 30; // Delay between "typing" each line in an RTE

  let currentTemplateData = null;
  let lastAttemptedSignature = null;
  let isConfirmationModalOpen = false;

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

  // --- Modal Utility (showConfirmationModal - no changes from your last working version) ---
  function showConfirmationModal(fieldName, onInject, onKeep) {
    if (isConfirmationModalOpen) {
      logger.warn(
        '⚠️',
        'Confirmation modal already open. Defaulting to "keep draft".'
      );
      onKeep();
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

  // --- Helper Functions (no changes to these from previous version) ---
  function getSelectedValueFromPicker(selectorId) {
    /* ... */
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
    /* ... */
    if (!projectText) return null;
    const match = projectText.match(/\(([^)]+)\)$/);
    if (match && match[1]) return match[1].toUpperCase();
    const parts = projectText.split(' ');
    if (parts.length > 1 && parts[parts.length - 1].length <= 4)
      return parts[parts.length - 1].toUpperCase();
    return projectText.split(' ')[0].toUpperCase();
  }
  function formatIssueType(issueTypeText) {
    /* ... */
    if (!issueTypeText) return null;
    return issueTypeText.toUpperCase().replace(/\s+/g, '-');
  }
  function buildTemplateUrl(projKey, issType) {
    /* ... */
    if (!projKey || !issType) return null;
    const fileName = `${projKey}_${issType}.json`;
    return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPONAME}/${GITHUB_BRANCH}/templates/${fileName}`;
  }
  function triggerInputEvent(element) {
    /* ... */
    // For contentEditable, the 'input' event is crucial.
    // For regular inputs, both 'input' and 'change' are good.
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const changeEvent = new Event('change', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(changeEvent);
    }
  }
  function findRichTextEditableArea(containerElement) {
    /* ... (use your last working version) ... */
    if (!containerElement) return null;
    const innerRTEWrapper = containerElement.querySelector(
      INNER_RTE_WRAPPER_SELECTOR
    );
    const searchBase = innerRTEWrapper || containerElement;
    for (const selector of RICH_TEXT_EDITABLE_AREA_SELECTORS) {
      const editableArea = searchBase.querySelector(selector);
      if (editableArea) return editableArea;
    }
    if (searchBase.matches('[contenteditable="true"][role="textbox"]')) {
      return searchBase;
    }
    return null;
  }
  function isRichTextEditorEmpty(editorElement) {
    /* ... (use your last working version) ... */
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
    // Check if it's just <p><br></p> or similar empty structures
    if (
      editorElement.innerHTML.trim().toLowerCase().replace(/\s/g, '') ===
      '<p><brclass="prosemirror-trailingbreak"></p>'
    )
      return true;
    if (editorElement.textContent.trim() === '') {
      // Fallback to textContent
      return true;
    }
    // More robust check for single empty paragraph, handling variations
    const firstChild = editorElement.firstElementChild;
    if (
      editorElement.children.length === 1 &&
      firstChild &&
      firstChild.tagName === 'P' &&
      (firstChild.innerHTML.trim() === '' ||
        firstChild.innerHTML.trim().toLowerCase() === '<br>' ||
        firstChild.innerHTML.trim().toLowerCase() ===
          '<brclass="prosemirror-trailingbreak">')
    ) {
      if (
        editorElement.querySelectorAll(
          'img, table, ul, ol, pre, blockquote, hr, li'
        ).length === 0
      ) {
        return true;
      }
    }
    return false;
  }

  async function simulateTypingInRTE(rteElement, markdownText, fieldIdForLog) {
    logger.log('⌨️', `Simulating typing for "${fieldIdForLog}"...`);
    rteElement.focus();

    // Clear existing placeholder or minimal content first if PM doesn't do it on first input
    // This needs to be gentle not to trigger too many unwanted events before typing
    if (isRichTextEditorEmpty(rteElement)) {
      // Check if truly empty or just placeholder
      const placeholder = rteElement.querySelector(
        RICH_TEXT_PLACEHOLDER_SELECTOR
      );
      if (
        placeholder ||
        rteElement.innerHTML.trim().toLowerCase().includes('<p><br')
      ) {
        // Try to set a minimal valid empty state for ProseMirror before typing
        // This helps if execCommand('selectAll') + execCommand('delete') is too aggressive
        // Or if just starting to type doesn't clear the placeholder correctly.
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null); // Clears selection
        triggerInputEvent(rteElement); // Notify PM of clear
        await new Promise((resolve) => setTimeout(resolve, 30)); // Short pause
      }
    }

    const lines = markdownText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];

      if (lineText.trim() !== '' || i < lines.length - 1) {
        // Process non-empty lines or if it's not the very last line (to ensure final Enter if markdown ends with newline)
        // Insert the text of the line
        // Using insertText is generally preferred for contentEditable
        if (document.execCommand('insertText', false, lineText)) {
          // logger.log(`  Typed line: "${lineText}"`);
        } else {
          logger.warn(
            `[${fieldIdForLog}] execCommand('insertText') failed for line: "${lineText}". Trying alternative.`
          );
          // Fallback: This is much harder and less reliable.
          // For now, we'll log and continue. True character-by-character simulation is complex.
          // A simple innerHTML append here would break ProseMirror's model.
          // We could try inserting at selection, but that's also non-trivial.
          rteElement.textContent += lineText; // Very basic fallback, likely won't trigger PM rules well
        }
        triggerInputEvent(rteElement); // Crucial for ProseMirror to process the inserted text and apply input rules
      }

      // If it's not the last line, or if it is the last line but the original markdown ended with a newline (implying a final paragraph)
      // simulate an "Enter" key press.
      if (
        i < lines.length - 1 ||
        (i === lines.length - 1 && markdownText.endsWith('\n'))
      ) {
        // logger.log('  Simulating Enter...');

        // Dispatching keyboard events for "Enter"
        // Note: Programmatic key events don't always behave identically to user-generated ones,
        // especially for complex editors. ProseMirror might rely more on the 'input' event after 'insertText'
        // or have specific commands for inserting paragraphs.
        const enterEventDown = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        const enterEventBeforeInput = new Event('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
        }); // More modern
        const enterEventUp = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });

        rteElement.dispatchEvent(enterEventDown);
        rteElement.dispatchEvent(enterEventBeforeInput); // Some editors listen to this

        // Instead of relying on key events to create the paragraph,
        // we can try using execCommand again if 'insertParagraph' is supported,
        // or let the next 'insertText' on a new (empty) line implicitly start a new paragraph.
        // Most ProseMirror setups will create a new paragraph upon 'input' event after 'insertText'
        // if the previous text ended a block or if an "Enter" was simulated that PM recognized.
        // The most important thing is that PM registers the 'input' from the line text.
        // The next line's insertText will then likely go into a new paragraph.
        // If PM's input rules for Enter are robust, the keydown might be enough.
        // For now, the triggerInputEvent after lineText is the primary mechanism for rules.

        // If `insertParagraph` is a command PM is set up for, this would be ideal:
        // document.execCommand('insertParagraph', false, null);
        // triggerInputEvent(rteElement);

        rteElement.dispatchEvent(enterEventUp); // Complete the key sequence
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RTE_LINE_TYPING_DELAY_MS)
      );
    }
    logger.log('✅', `Finished simulating typing for "${fieldIdForLog}".`);
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

    const injectedSimpleTextFields = new Map();

    for (const field of template.fields) {
      if (field.type !== 'text') {
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
      // logger.log(`[${fieldIdForLog}] Processing field. Type: ${field.type}`); // Reduced verbosity

      const outerFieldWrapperSelector = `[data-testid="${OUTER_FIELD_WRAPPER_TESTID_PREFIX}${field.id}"]`;
      const outerFieldWrapper = document.querySelector(
        outerFieldWrapperSelector
      );

      if (outerFieldWrapper) {
        const rteAreaViaInnerWrapper =
          findRichTextEditableArea(outerFieldWrapper);
        if (rteAreaViaInnerWrapper) {
          targetElement = rteAreaViaInnerWrapper;
          isRichText = true;
        } else {
          targetElement =
            outerFieldWrapper.querySelector(
              `input[id="${field.id}"], textarea[id="${field.id}"]`
            ) ||
            outerFieldWrapper.querySelector(
              `input[name="${field.id}"], textarea[name="${field.id}"]`
            ) ||
            outerFieldWrapper.querySelector(
              'input[type="text"], textarea, input:not([type]), div[contenteditable="true"]:not([role="textbox"])'
            );
          if (targetElement) {
            isRichText = false;
            if (
              targetElement.isContentEditable &&
              findRichTextEditableArea(targetElement)
            ) {
              isRichText = true;
            }
          }
        }
      } else {
        logger.warn(
          `[${fieldIdForLog}] OUTER field wrapper NOT found: ${outerFieldWrapperSelector}.`
        );
      }

      if (!targetElement) {
        logger.warn(
          '🤷',
          `[${fieldIdForLog}] Field target ultimately not found.`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
        );
        continue;
      }

      // --- Apply Injection ---
      if (isRichText) {
        const doActualRTEInjection = async () => {
          // Made async for simulateTypingInRTE
          await simulateTypingInRTE(targetElement, field.value, fieldIdForLog);
          // No need to set .innerHTML or triggerInputEvent here if simulateTypingInRTE handles it
        };

        if (!isRichTextEditorEmpty(targetElement)) {
          logger.log(
            '🤔',
            `Rich text editor: ${fieldIdForLog} already has content. Prompting user.`
          );
          try {
            // showConfirmationModal calls onInject (doActualRTEInjection) or onKeep.
            // onInject will be called after user clicks "Inject Template"
            await showConfirmationModal(
              fieldIdForLog,
              doActualRTEInjection,
              () => {
                logger.log(
                  '🚫',
                  `User chose to keep draft for ${fieldIdForLog}.`
                );
              }
            );
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
            `Rich text editor: ${fieldIdForLog} is empty. Injecting (simulating typing) directly.`
          );
          await doActualRTEInjection();
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
            `Injected into standard input/textarea: ${fieldIdForLog}`
          );
          injectedSimpleTextFields.set(field.id, {
            target: targetElement,
            value: field.value,
            type: 'input',
          });
        } else {
          logger.log(
            '🤔',
            `Standard input/textarea: ${fieldIdForLog} already has content, skipped.`
          );
        }
      } else if (targetElement.isContentEditable) {
        // Generic contentEditable
        if (targetElement.textContent.trim() === '') {
          targetElement.textContent = field.value;
          triggerInputEvent(targetElement);
          logger.log(
            '✍️',
            `Injected into generic contentEditable: ${fieldIdForLog}`
          );
          injectedSimpleTextFields.set(field.id, {
            target: targetElement,
            value: field.value,
            type: 'contentEditable',
          });
        } else {
          logger.log(
            '🤔',
            `Generic contentEditable: ${fieldIdForLog} already has content, skipped.`
          );
        }
      } else {
        logger.warn(
          '🤷',
          `Field: "${fieldIdForLog}" (type: ${field.type}) found, but no specific injection logic matched.`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, FIELD_PROCESS_DELAY_MS)
      );
    } // End of for...of loop for fields

    // --- Post-injection re-check (no changes from previous version) ---
    if (injectedSimpleTextFields.size > 0) {
      /* ... */
    }
    logger.log('🏁', 'Finished applying template fields.');
  }

  // --- Core Logic (loadAndApplyTemplate, onModalContextChange, observeSelectors, modalObserver - no changes from your previous version) ---
  // ... (ensure these are exactly as in your last working version)
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
        'Project or Issue Type not fully selected/extracted. Clearing current template state.'
      );
      currentTemplateData = null;
      lastAttemptedSignature = `project-${pk}_issueType-${it}`;
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
    setTimeout(() => {
      loadAndApplyTemplate();
    }, 50);
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
