# 🚀 Jira Template Injector

Jira Template Injector is a dynamic and fully customizable Tampermonkey script that automatically injects predefined templates into Jira issue creation forms, based on the selected project and issue type.

## 🌐 How it works

- When you open the "Create Issue" modal in Jira, the script automatically detects the selected **Project** and **Issue Type**.
- It then loads the corresponding JSON template file from this repository (based on the format `[PROJECT_KEY]_[WORK_TYPE].json`).
- All fields defined in the JSON template are automatically injected, without requiring any modification of the script.

## 📌 Features

- **Fully dynamic:** Supports any field type, any project, any issue type.
- **No hardcoded fields:** The script does not need to be updated for new fields.
- **Centralized templates:** Templates are stored in this GitHub repository, making them easily updatable for the entire team.
- **Automatic field filling:** Only empty fields are filled to prevent overwriting user input.

## 📁 Repository Structure

```plaintext
.
├── templates/
│   ├── MYPROJECT_BUG.json
│   ├── MYPROJECT_TASK.json
│   ├── MYPROJECT_USER-STORY.json
│   └── MYPROJECT_EPIC.json
├── jira-template-injector.user.js
└── README.md
```

- **templates/**: Directory containing all JSON templates, named using the pattern `[PROJECT_KEY]_[WORK_TYPE].json`.
- **jira-template-injector.user.js**: The Tampermonkey script that dynamically loads and applies the templates.
- **README.md**: This documentation file.

## 🚀 Installation

1. Install the [Tampermonkey extension](https://www.tampermonkey.net/) for your web browser (Chrome, Firefox, Edge).
2. Copy the contents of `jira-template-injector.user.js` from this repository.
3. Create a new Tampermonkey script and paste the code.
4. Set the `GITHUB_BASE_URL` constant in the script to point to this repository's raw URL for the templates:
   ```javascript
   const GITHUB_BASE_URL =
     'https://raw.githubusercontent.com/YourUsername/YourRepository/main/templates/';
   ```
5. Save the script.

## ✨ How to create or update templates

1. Go to the templates/ folder in this repository.
2. Create a new JSON file named [PROJECT_KEY]\_[WORK_TYPE].json (e.g., EG_USER-STORY.json).
3. Add your desired fields in JSON format:

```json
{
  "summary": "Default Summary",
  "description": "Default Description",
  "priority": "High",
  "labels": ["auto", "template"],
  "customfield_10010": "Custom Value"
}
```

4. Save the file. All team members will automatically use the new template without modifying the script.

## ✅ Usage

- Go to your Jira instance (e.g., https://blue-whale.atlassian.net/jira/).
- Click on the "Create" button.
- Select your Project and Issue Type.
- The script will automatically fill the form based on the matching JSON template.

## 👥 Contribution

Contributions are welcome! To contribute:

1. Fork this repository.
2. Create a new branch:

```bash
git checkout -b feature/your-feature-name
```

3. Make your changes.
4. Submit a pull request.

## 📋 Pull Request Template

- Title: Clear and descriptive (e.g., Feature: Add support for new field type).
- Description: Describe your changes clearly.
- Checklist:
  Code is clean and well-documented.
  No hardcoded fields in the script.
  The new feature is fully dynamic (no changes required in the script for new fields).

## 📜 License

[Jira Template Injector](https://github.com/FloLecoeuche/Jira-Template-Injector) by [Florian LECOEUCHE](https://www.linkedin.com/in/florianlecoeuche/) is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1).

![Creative Commons License](https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1)
![Creative Commons BY](https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1)
![Creative Commons NC](https://mirrors.creativecommons.org/presskit/icons/nc.svg?ref=chooser-v1)
![Creative Commons SA](https://mirrors.creativecommons.org/presskit/icons/sa.svg?ref=chooser-v1)
