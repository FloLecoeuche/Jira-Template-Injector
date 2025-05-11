# 🚀 Jira Template Injector 🚀

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

A [Tampermonkey](https://www.tampermonkey.net/) userscript designed to supercharge your Jira Cloud experience! ⚡ Automatically inject pre-defined templates into ticket creation fields based on the selected project and work type. Say goodbye to repetitive typing and hello to consistency!

## 🌟 Why Use Jira Template Injector?

- ⏱️ **Save Time:** No more manually typing boilerplate text for user stories, bug reports, etc.
- 📏 **Ensure Consistency:** Standardize the information captured for different work types across projects.
- 🧩 **Improve Clarity:** Guide users to fill in the necessary details with pre-structured templates.
- 🎯 **Boost Productivity:** Streamline your Jira workflow.

## 🧭 Context

Modern agile teams using Jira Cloud often rely on structured ticket creation forms. This script enhances that by programmatically filling in text fields, ensuring that critical information isn't missed and that everyone follows the same format.

## 🎯 Core Goal

To provide a lightweight, maintainable, and scalable Tampermonkey script that automates template injection in Jira, making ticket creation faster and more standardized.

## ✨ Key Features

- 👀 **Smart Context Detection:**
  - Activates when Jira's "Create" modal appears.
  - Monitors changes in the "Project" and "Work Type" selectors.
- 🔑 **Effortless Key Extraction:**
  - Automatically pulls the project key (e.g., `EG` from "ERP - GEO (EG)").
  - Formats the work type (e.g., "User Story" becomes `USER-STORY`).
- ☁️ **Centralized Template Loading:**
  - Fetches JSON template files directly from a specified GitHub repository.
  - Example: `EG_USER-STORY.json` for Project `EG` and Work Type `User Story`.
- ✍️ **Intelligent Content Injection:**
  - Injects template content only into _empty_ text fields.
  - Handles standard text inputs, textareas, and complex rich text editors (like Jira's description field).
  - Triggers necessary browser events (`input`, `change`) so Jira recognizes the injected values.
- 🛡️ **User-Friendly Overwrite Protection:**
  - If a rich text field (like "Description") already contains user-entered content, a confirmation modal appears.
  - Users can choose to "Inject Template" (overwrite) or "Keep Draft".
- 🔄 **Dynamic Re-injection:**
  - Automatically re-evaluates and injects the correct template if the user changes the Project or Work Type within the modal.
- 🤷 **Graceful Handling:**
  - Does nothing if a template for the selected project/work type combination is not found (404).
  - Logs events clearly in the browser console for easy debugging.

## 🌳 Project Structure

```plaintext
jira-template-injector/
├── .gitignore
├── README.md
├── src/
│   ├── main.js         # Main business logic
│   └── loader.user.js  # Tampermonkey script to load main.js
└── templates/
    ├── PROJECT-KEY_WORK-TYPE.json
    ├── EXAMPLEPROJECT_BUG.json
    └── EXAMPLEPROJECT_USER-STORY.json
```

## 🛠️ Getting Started: Installation

Follow these steps to get the Jira Template Injector up and running:

1.  **✅ Install a Userscript Manager:**
    You'll need an extension that can run userscripts. [Tampermonkey](https://www.tampermonkey.net/) is highly recommended.

    - 🦊 [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
    - ⛽ [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    - 엣 [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
    - 🍏 [Safari](https://apps.apple.com/app/apple-store/id1482490089?mt=8) (Note: Tampermonkey for Safari might be a paid app)
    - Other browsers: Check the [Tampermonkey website](https://www.tampermonkey.net/).

2.  **📜 Install the Loader Script:**
    This script is tiny and its only job is to load the main script from GitHub. This allows for easy updates to the main script without you needing to reinstall the Tampermonkey script.

    - Open Tampermonkey in your browser (usually an icon in the toolbar).
    - Go to the "Dashboard".
    - Click the "+" tab (Create a new script).
    - Delete any existing content in the editor.
    - Copy the **entire content** of the `src/loader.user.js` file from this repository.
    - Paste it into the Tampermonkey editor.
    - **🚨 IMPORTANT CONFIGURATION 🚨**:
      Inside `loader.user.js`, you **MUST** update these constants to point to your GitHub repository where `main.js` and your `templates/` folder are hosted:
      ```javascript
      const GITHUB_USERNAME = 'YourGitHubUsername'; // 👈 Replace with your GitHub username
      const GITHUB_REPONAME = 'jira-template-injector'; // 👈 Replace with your repository name
      const GITHUB_BRANCH = 'main'; // Or your default branch (e.g., 'master')
      ```
    - Save the script in Tampermonkey (usually File > Save, or Ctrl+S / Cmd+S).

3.  **☁️ Host Your Files on GitHub:**

    - **Fork this repository** or create your own public GitHub repository.
    - Ensure your repository has the same structure as shown in the "Project Structure" section above.
    - The `src/main.js` file and the `templates/` directory (with your JSON templates) must be publicly accessible. The loader script uses raw GitHub links (e.g., `https://raw.githubusercontent.com/USERNAME/REPO/BRANCH/src/main.js`).

4.  **🎉 You're Ready!**
    Open Jira Cloud, navigate to create an work item, and the script should start working once you select a project and work type that has a corresponding template.

## 📁 Template File Structure & Content

Templates are the heart of this injector!

- **Location:** Store all your template files in the `templates/` directory of your GitHub repository.
- **Naming Convention:** `PROJECT-KEY_WORK-TYPE.json`

  - `PROJECT-KEY`: The short key for your Jira project (e.g., `EG`, `ERP`).
  - `WORK-TYPE`: The work type, formatted in uppercase with spaces replaced by hyphens (e.g., `USER-STORY`, `BUG`, `TASK`).
  - **Example:** `EG_USER-STORY.json`

- **Content (JSON Format):**
  Each `.json` file contains an object with a single key, `fields`, which is an array of field objects to inject.

  ```json
  {
    "fields": [
      {
        "id": "summary", // Target field's ID or name attribute in Jira's HTML
        "displayName": "Summary", // Optional: User-friendly name for prompts
        "value": "US: As a [Role], I want to [Action], so that [Benefit]",
        "type": "text" // Currently supports "text" (for inputs, textareas, RTEs)
        // Future: "select"
      },
      {
        "id": "description",
        "displayName": "Description",
        "value": "User Acceptance Criteria:\n- \n\nTechnical Notes:\n- ",
        "type": "text"
      }
      // {
      //   "id": "priority", // Example for a future "select" type
      //   "displayName": "Priority",
      //   "value": "High", // The exact text of the option to select
      //   "type": "select"
      // }
    ]
  }
  ```

  - `id`: **Crucial!** This is the HTML `id` or `name` attribute of the field in Jira's "Create" form. For complex fields like "Description" or custom fields, you might need to use browser developer tools (F12) to inspect the element and find its unique identifier. The script also tries to find wrappers using `data-testid` attributes if `id` is related (e.g., `id="description"` can help find `data-testid="...description-field.wrapper"`).
  - `displayName` (Optional): A user-friendly name for the field, used in prompts (e.g., the overwrite confirmation modal). Defaults to `id` if not provided.
  - `value`: The text content or value to inject. For multi-line text, use `\n`.
  - `type`:
    - `"text"`: For standard text inputs, textareas, and rich text editors.
    - `"select"`: (Planned for future enhancement) To select an option from a dropdown.

## 🪵 Debugging & Logs

The script provides detailed logs in your browser's developer console (F12) to help with setup and troubleshooting. Look for messages prefixed with `[JTI]`.

- `🔃 Loader script started.`
- `🚀 Main script started.`
- `✅ Create form is present.`
- `🔄 Modal context change detected.`
- `📦 Attempting to load template for...`
- `✅ Template loaded successfully.` / `🤷 Template not found (404).`
- `🧠 Applying template to fields...`
- `✍️ Injected into...` / `🤔 Field already has content...`
- `🤷 Field target not found...`

These logs are invaluable for understanding what the script is doing and why it might not be working as expected for a particular field or template.

## 💡 Future Enhancements (Scalability)

This script is built with evolvability in mind:

- 🧬 **Support for More Field Types:**
  - `select` dropdowns.
  - `checkbox` / `radio` buttons.
  - Date pickers.
  - User pickers.
- 🎨 **Optional UI for Configuration:** A settings panel (perhaps within Tampermonkey or a separate small UI injected into Jira) to:
  - Manage template repository URLs.
  - Provide a live editor for templates.
  - Customize script behavior.
- 🔄 **Caching:** Cache templates locally to reduce GitHub API calls.

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome! Please feel free to:

- 🔎 Check for existing issues.
- ➕ Open a new issue to report a bug or suggest a feature.
- 🛠️ Submit a Pull Request with your improvements.

## 📜 License

This project, "Jira Template Injector," is developed by [Florian LECOEUCHE](https://www.linkedin.com/in/florianlecoeuche/) and is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

[![CC BY-NC-SA 4.0 License](https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

You are free to:

- **Share** — copy and redistribute the material in any medium or format.
- **Adapt** — remix, transform, and build upon the material.

Under the following terms:

- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **NonCommercial** — You may not use the material for commercial purposes.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

---

Made with ❤️ and 🤖
