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
  // --- END INTERNAL CONFIGURATION ---

  let projectKey = null;
  let issueType = null;
  let lastInjectedSignature = null; // To avoid multiple re-injections for the same combination

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

  function getSelectedValueFromPicker(selectorId, attribute = 'aria-label') {
    const picker = document.getElementById(selectorId);
    if (picker) {
      // Jira often uses a div with a role and aria-label to display the selected value.
      // The text content might be in a span inside.
      // Target the container that has the relevant information.
      const valueContainer = picker.querySelector(
        '.single-select__value-container, [class*="singleValue"], [class*="placeholder"]'
      );
      if (valueContainer && valueContainer.textContent) {
        return valueContainer.textContent.trim();
      }
      // Fallback if the structure is different, or for simpler selects (less likely in modern Jira)
      if (picker.value) return picker.value;
      if (picker.textContent) return picker.textContent.trim();
    }
    return null;
  }

  function extractProjectKey(projectText) {
    if (!projectText) return null;
    // Ex: "ERP - GEO (EG)" -> EG
    const match = projectText.match(/\(([^)]+)\)$/);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    // Fallback: if no parentheses, try to take an abbreviation or keyword
    // This is an example, adapt according to project naming conventions
    const parts = projectText.split(' ');
    if (parts.length > 1 && parts[parts.length - 1].length <= 4)
      return parts[parts.length - 1].toUpperCase();
    return projectText.split(' ')[0].toUpperCase(); // Takes the first word in uppercase as a fallback
  }

  function formatIssueType(issueTypeText) {
    if (!issueTypeText) return null;
    // Ex: "User Story" -> USER-STORY
    return issueTypeText.toUpperCase().replace(/\s+/g, '-');
  }

  function buildTemplateUrl(projKey, issType) {
    if (!projKey || !issType) return null;
    const fileName = `${projKey}_${issType}.json`;
    return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPONAME}/${GITHUB_BRANCH}/templates/${fileName}`;
  }

  function triggerInputEvent(element) {
    // For Jira (React/etc.) to recognize the change
    const eventInput = new Event('input', { bubbles: true, cancelable: true });
    const eventChange = new Event('change', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(eventInput);
    element.dispatchEvent(eventChange);
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
      if (field.type === 'text') {
        // For now, only "text" is handled
        // Jira often uses contenteditable divs for rich text fields like description.
        // Simple fields like summary can be input or textarea.
        let targetElement = document.getElementById(field.id);

        if (!targetElement) {
          // Try to find by name if ID is not found (for more flexibility)
          targetElement = document.querySelector(`[name="${field.id}"]`);
        }

        // Specific case for the description field which is often a rich text editor (Prosemirror)
        if (field.id === 'description' && !targetElement) {
          targetElement = document.querySelector(
            '.ProseMirror[role="textbox"], div[aria-label="Main content area"]'
          );
          // If it's a contenteditable div, text needs to be injected differently.
          if (targetElement && targetElement.isContentEditable) {
            if (targetElement.textContent.trim() === '') {
              // Check if content is empty
              // For Prosemirror, you sometimes need to simulate typing or use specific commands.
              // A simple approach is to set focus and insert text.
              // However, the simplest and often effective way is to modify `innerHTML` or `textContent`
              // and trigger events.
              // For description, it might be multiple <p>
              const paragraphs = field.value.split('\n');
              targetElement.innerHTML = paragraphs
                .map(
                  (pText) =>
                    `<p>${pText
                      .replace(/&/g, '&')
                      .replace(/</g, '<')
                      .replace(/>/g, '>')}</p>`
                )
                .join('');
              triggerInputEvent(targetElement); // May require more specific events for Prosemirror
              logger.log(
                '✍️',
                `Injected into rich text field (e.g., description) ID: ${field.id}`
              );
            } else {
              logger.log(
                '🤔',
                `Rich text field ID: ${field.id} already has content, skipped.`
              );
            }
            return; // Exit after handling the description field
          } else if (targetElement && targetElement.value !== undefined) {
            // It's a standard input/textarea
            if (targetElement.value.trim() === '') {
              targetElement.value = field.value;
              triggerInputEvent(targetElement);
              logger.log('✍️', `Injected into field ID: ${field.id}`);
            } else {
              logger.log(
                '🤔',
                `Field ID: ${field.id} already has content, skipped.`
              );
            }
          } else {
            logger.warn(
              '🤷',
              `Field with ID/Name: ${field.id} (description fallback) not found or not a standard input/textarea/contentEditable.`
            );
          }
        } else if (targetElement && targetElement.value !== undefined) {
          // For <input> and <textarea>
          if (targetElement.value.trim() === '') {
            targetElement.value = field.value;
            triggerInputEvent(targetElement);
            logger.log('✍️', `Injected into field ID: ${field.id}`);
          } else {
            logger.log(
              '🤔',
              `Field ID: ${field.id} already has content, skipped.`
            );
          }
        } else if (targetElement && targetElement.isContentEditable) {
          // For generic contenteditable div
          if (targetElement.textContent.trim() === '') {
            targetElement.textContent = field.value;
            triggerInputEvent(targetElement);
            logger.log(
              '✍️',
              `Injected into contentEditable field ID: ${field.id}`
            );
          } else {
            logger.log(
              '🤔',
              `contentEditable field ID: ${field.id} already has content, skipped.`
            );
          }
        } else {
          logger.warn(
            '🤷',
            `Field with ID/Name: ${field.id} not found or not a standard input/textarea.`
          );
        }
      } else {
        logger.warn(
          '🧐',
          `Unsupported field type "${field.type}" for field ID: ${field.id}. Skipping.`
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
        `Template for ${currentSignature} was already processed for this form instance. Skipping re-fetch unless forced.`
      );
      // We might want to re-apply if fields were manually cleared.
      // But current logic is not to re-inject if fields are filled.
      // And if project/type changes, lastInjectedSignature will be different.
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
        lastInjectedSignature = currentSignature; // Mark as injected for this combination
      } else if (response.status === 404) {
        logger.warn(
          '🤷',
          `Template not found (404) for ${projectKey}_${issueType}.json. No template will be applied.`
        );
        lastInjectedSignature = null; // Reset to allow a new attempt if user re-selects
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

    // Jira might replace these elements or their content rather than just changing a value.
    // So we observe changes in their parents or on themselves (attributes/childList).
    // It's crucial to target the element that actually changes.
    // Often, it's the text inside the selector that changes.
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
    };

    const projectObserver = new MutationObserver((mutationsList, observer) => {
      for (let mutation of mutationsList) {
        // We check if the text changed, or if a relevant node was added/removed
        if (
          mutation.type === 'childList' ||
          mutation.type === 'characterData'
        ) {
          logger.log('🔍', 'Project changed/detected.');
          lastInjectedSignature = null; // Allow re-injection if project changes
          loadAndApplyTemplate();
          return; // Process once per batch of mutations
        }
      }
    });

    const issueTypeObserver = new MutationObserver(
      (mutationsList, observer) => {
        for (let mutation of mutationsList) {
          if (
            mutation.type === 'childList' ||
            mutation.type === 'characterData'
          ) {
            logger.log('🏷️', 'Issue Type changed/detected.');
            lastInjectedSignature = null; // Allow re-injection if type changes
            loadAndApplyTemplate();
            return;
          }
        }
      }
    );

    // The elements where selectors display the value are often children of the main ID
    // We observe the value container.
    const projectValueContainer = projectSelector.querySelector(
      '.single-select__value-container, [class*="singleValue"]'
    );
    const issueTypeValueContainer = issueTypeSelector.querySelector(
      '.single-select__value-container, [class*="singleValue"]'
    );

    if (projectValueContainer)
      projectObserver.observe(projectValueContainer, observerConfig);
    else projectObserver.observe(projectSelector, observerConfig); // Fallback

    if (issueTypeValueContainer)
      issueTypeObserver.observe(issueTypeValueContainer, observerConfig);
    else issueTypeObserver.observe(issueTypeSelector, observerConfig); // Fallback

    // Initial call to load template if fields are already selected on opening
    loadAndApplyTemplate();

    // Cleanup: ensure observers are disconnected if the modal closes
    // This is handled by the fact that these observers are created only when the modal is detected
    // and they are bound to elements that disappear with the modal.
  }

  // Observe the opening of the creation modal
  const modalObserver = new MutationObserver((mutationsList, observer) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const createForm = document.getElementById(CREATE_MODAL_ID);
        if (createForm && !createForm.dataset.jtiObserved) {
          logger.log('✅', 'Form is present:', createForm);
          createForm.dataset.jtiObserved = 'true'; // Mark to avoid multiple attachments
          lastInjectedSignature = null; // Reset for a new modal
          observeSelectors(); // Start observers for project/type
        } else if (
          !createForm &&
          document.querySelector(`[data-jti-observed="true"]`)
        ) {
          // Modal has closed, clean up marker if necessary
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

  // Start observing the document body for modal addition
  modalObserver.observe(document.body, { childList: true, subtree: true });
  logger.log('👀', 'Observing document body for create modal...');
})();
