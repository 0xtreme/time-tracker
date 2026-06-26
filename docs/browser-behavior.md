# Browser Behavior

## Supported Assumption

The app is designed for current Chrome, Edge, Firefox, and Safari. Chrome or Edge is the recommended operating environment because local storage behavior is predictable in normal browsing profiles.

## Closing the Window

Browsers do not reliably keep page JavaScript running after a tab or window is closed. This app avoids that dependency.

When a timer starts, the app saves its start timestamp immediately. If the window closes, the timer can still be reconstructed from the saved timestamp. On reopen, the app compares the current time with the last recorded browser activity and asks how to handle long gaps.

## Differences Between Browsers

Normal browsing profiles should retain `localStorage` until the user clears site data.

Private browsing modes may delete data when the private session ends. Safari and some managed browser environments can be more aggressive about storage cleanup. Browser extensions and corporate policies can also clear local data.

## Practical Guidance

Use a normal browser profile for real records. Export a JSON backup before clearing browser data, switching machines, or relying on the log for client or payroll submission.

Browsers require user interaction for local file save and restore. The app can provide explicit backup and restore buttons, but it cannot reliably write to or upload a user file automatically when the window closes.
