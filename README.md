# NOC List

```
    _   ______  ______   __    _      __ 
   / | / / __ \/ ____/  / /   (_)____/ /_
  /  |/ / / / / /      / /   / / ___/ __/
 / /|  / /_/ / /___   / /___/ (__  ) /_  
/_/ |_/\____/\____/  /_____/_/____/\__/  
                                         
```

This project is a minimal React + Electron application for managing contacts and email groups.

## Development

Install dependencies and start the app:

```bash
npm install
npm start
```

## Running Tests

Vitest is used for unit testing. To run the test suite:

```bash
npm test
```

## Clean Shutdown Check

To manually verify that background processes terminate properly:

1. Start the app with `npm start`.
2. Once the window opens, end the process with `Ctrl+C` (SIGINT) or `kill` (SIGTERM).
3. Confirm the command exits and no Node or Electron processes remain.

## Custom Logo and Icon

To replace the ASCII logo shown in the app, add a `logo.png` file to the
`public` folder. If the file exists it will be displayed instead of the
text banner.

For a custom application icon, place `icon.png` and `icon.ico` in the
`public` folder. The packaging script automatically includes the
ICO file when present.

## Packaging

Build the React frontend and package the Electron app into a Windows executable:

```bash
npm run package
```

The generated `release/NOCList-win32-x64` folder will contain `NOCList.exe`. Place
`groups.xlsx` and `contacts.xlsx` next to the executable so the application can
load them at runtime.

If `public/icon.ico` exists it will be used as the Windows
application icon.

## Continuous Integration

A GitHub Actions workflow builds the Windows package on each push to `main`.
The resulting `release/NOCList-win32-x64` folder is uploaded as a workflow artifact.

