# Jira Template Injector

A Tampermonkey script to automatically inject templates into Jira Cloud ticket creation fields, based on the selected project and issue type.

## 🧭 Context

The team uses Jira Cloud with ticket creation forms. To save time and standardize field input when creating a ticket (e.g., User Story, Bug...), this user script automatically injects a template into text fields, according to the selected Jira project and ticket type.

## 🎯 Product Goal

Automate the injection of templates into Jira text fields, based on the selected project and issue type, via a lightweight, maintainable, scalable, and centralized Tampermonkey script.

## ✨ Features

1.  **Context Detection**: Observes the opening of the ticket creation modal and changes to the project and issue type selectors.
2.  **Key Extraction**: Extracts and formats the project key (e.g., `EG`) and issue type (e.g., `USER-STORY`).
3.  **Template Loading**: Downloads the corresponding JSON template (`EG_USER-STORY.json`) from this GitHub repository.
4.  **Content Injection**: Injects the template content into empty text fields, triggering the necessary `input` events.
5.  **Intelligent Behavior**:
    - Does not re-inject if fields are already filled by the user.
    - Re-injects if the project or issue type is changed.
    - Does nothing if no recognized project/issue type combination is found or if the template is not found.

## 🌳 Project Directory Structure

```plaintext
jira-template-injector/
├── .gitignore
├── README.md
├── src/
│   ├── main.js         # Main business logic
│   └── loader.user.js  # Tampermonkey script to load main.js
└── templates/
    ├── EXAMPLEPROJECT_BUG.json
    └── EXAMPLEPROJECT_USER-STORY.json
    └── EG_USER-STORY.json # Example based on the PRD
```

## 🛠️ Installation

1.  **Install Tampermonkey**:

    - Ensure you have the Tampermonkey extension installed in your browser:
      - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
      - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
      - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
      - [Safari](https://apps.apple.com/app/apple-store/id1482490089?mt=8) (Paid)
      - Other browsers: visit [tampermonkey.net](https://www.tampermonkey.net/)

2.  **Configure the Loader Script**:

    - Click the Tampermonkey icon in your browser and select "Dashboard".
    - Click the "+" tab to create a new script.
    - Delete the default content.
    - Copy the content of `src/loader.user.js` (see below) and paste it into the Tampermonkey editor.
    - **IMPORTANT**: Modify the `GITHUB_USERNAME` and `GITHUB_REPONAME` variables in the `loader.user.js` script to point to your fork or your own GitHub repository where `main.js` and the templates will be hosted. For example:
      ```javascript
      const GITHUB_USERNAME = 'YourGithubUsername';
      const GITHUB_REPONAME = 'jira-template-injector'; // Or your repository name
      ```
    - Save the script (File > Save or Ctrl+S).

3.  **Host the Files**:
    - Clone this repository or create your own with the proposed file structure.
    - Ensure that the `src/main.js` file and the `templates/` directory are publicly accessible via GitHub Raw (e.g., `https://raw.githubusercontent.com/USERNAME/REPO/main/src/main.js`).

## 📁 Template Structure

Templates are JSON files named `PROJECTKEY_ISSUETYPE.json` (e.g., `EG_USER-STORY.json`) and placed in the `templates/` directory of the repository.

Each JSON template contains a `fields` array, where each object represents a field to be filled:

```json
{
  "fields": [
    {
      "id": "description", // The field ID in Jira (often 'description', 'summary', etc.)
      "value": "As a [Role],\nI want [Action],\nSo that [Benefit].\n\nAcceptance Criteria:\n- Criterion 1\n- Criterion 2",
      "type": "text" // Field type (currently "text" only)
    },
    {
      "id": "summary",
      "value": "US: ",
      "type": "text"
    }
    // Add other fields here
  ]
}
```

## 📜 License

[Jira Template Injector](https://github.com/FloLecoeuche/Jira-Template-Injector) by [Florian LECOEUCHE](https://www.linkedin.com/in/florianlecoeuche/) is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1).

![Creative Commons License](https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1) ![Creative Commons BY](https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1) ![Creative Commons NC](https://mirrors.creativecommons.org/presskit/icons/nc.svg?ref=chooser-v1) ![Creative Commons SA](https://mirrors.creativecommons.org/presskit/icons/sa.svg?ref=chooser-v1)
